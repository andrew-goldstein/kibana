/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConversationLifecycleCreatedEvent,
  ConversationLifecycleMetadataUpdatedEvent,
} from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import type { ManagedWorkflowStateApi } from '@kbn/workflows/server/types';
import type { AlertZeroTelemetryReporter } from '../telemetry';
import { ALERTZERO_TELEMETRY_EVENTS } from '../telemetry';
import {
  buildInvestigationClosedPayload,
  buildInvestigationCreatedPayload,
  buildInvestigationReopenedPayload,
} from './build_investigation_payloads';
import type { InvestigationActor } from './classify_investigation_actor';
import { classifyInvestigationActor } from './classify_investigation_actor';
import { LIFECYCLE_LOOKUP_TIMEOUT_MS, MAX_IN_FLIGHT_LIFECYCLE_EVENTS } from './constants';
import type { InvestigationStatusTransition } from './get_investigation_status_transition';
import { getInvestigationStatusTransition } from './get_investigation_status_transition';
import { readInstalledWorkflow } from './read_installed_workflow';

export interface CreateInvestigationLifecycleListenersParams {
  /** AlertZero's owner-bound managed workflows client, once start has resolved it. */
  getManagedWorkflowState: () => Promise<ManagedWorkflowStateApi | undefined>;
  logger: Logger;
  lookupTimeoutMs?: number;
  maxInFlight?: number;
  reporter: AlertZeroTelemetryReporter;
}

export interface InvestigationLifecycleListeners {
  onCreated: (event: ConversationLifecycleCreatedEvent) => void;
  onMetadataUpdated: (event: ConversationLifecycleMetadataUpdatedEvent) => void;
  /** Makes every later or still-running listener call a no-op. */
  stop: () => void;
}

type LifecycleEventKind = 'created' | 'metadata_updated';

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Creates the `conversationLifecycle` listeners that report `alertzero_investigation_*` events.
 * They never throw and never reject: a failure is logged, excess concurrent work is dropped, and
 * nothing is reported once `stop` is called.
 */
export const createInvestigationLifecycleListeners = ({
  getManagedWorkflowState,
  logger,
  lookupTimeoutMs = LIFECYCLE_LOOKUP_TIMEOUT_MS,
  maxInFlight = MAX_IN_FLIGHT_LIFECYCLE_EVENTS,
  reporter,
}: CreateInvestigationLifecycleListenersParams): InvestigationLifecycleListeners => {
  const state = { inFlight: 0, stopped: false };

  const logFailure = (kind: LifecycleEventKind, conversationId: string, error: unknown): void => {
    logger.warn(
      `AlertZero Investigation lifecycle "${kind}" listener failed for conversation "${conversationId}": ${describeError(
        error
      )}`
    );
  };

  const classify = ({
    source,
    spaceId,
  }: ConversationLifecycleCreatedEvent): Promise<InvestigationActor> =>
    classifyInvestigationActor({
      logger,
      readInstalledWorkflow: ({ spaceId: inSpaceId, workflowId }) =>
        readInstalledWorkflow({
          getManagedWorkflowState,
          spaceId: inSpaceId,
          timeoutMs: lookupTimeoutMs,
          workflowId,
        }),
      source,
      spaceId,
    });

  /** Runs `task` unless stopped or at the in-flight bound, catching whatever it rejects with. */
  const runBounded = (
    kind: LifecycleEventKind,
    conversationId: string,
    task: () => Promise<void>
  ): void => {
    if (state.stopped) {
      return;
    }
    if (state.inFlight >= maxInFlight) {
      logger.debug(
        () =>
          `Dropped AlertZero Investigation lifecycle "${kind}" event for conversation "${conversationId}": ${state.inFlight} events already in flight`
      );
      return;
    }

    state.inFlight += 1;
    task()
      .catch((error) => logFailure(kind, conversationId, error))
      .finally(() => {
        state.inFlight -= 1;
      });
  };

  const reportCreated = async (event: ConversationLifecycleCreatedEvent): Promise<void> => {
    const actor = await classify(event);
    if (state.stopped) {
      return;
    }
    reporter(
      ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated,
      buildInvestigationCreatedPayload({ actor, event })
    );
  };

  const reportStatusTransition = async (
    event: ConversationLifecycleMetadataUpdatedEvent,
    transition: InvestigationStatusTransition
  ): Promise<void> => {
    const actor = await classify(event);
    if (state.stopped) {
      return;
    }
    if (transition === 'closed') {
      reporter(
        ALERTZERO_TELEMETRY_EVENTS.InvestigationClosed,
        buildInvestigationClosedPayload({ actor, event })
      );
      return;
    }
    reporter(
      ALERTZERO_TELEMETRY_EVENTS.InvestigationReopened,
      buildInvestigationReopenedPayload({ actor, event })
    );
  };

  return {
    onCreated: (event) => {
      try {
        runBounded('created', event.conversationId, () => reportCreated(event));
      } catch (error) {
        logFailure('created', event.conversationId, error);
      }
    },
    onMetadataUpdated: (event) => {
      try {
        // agentic_investigations reports the closes and reopens it writes itself, and its writes
        // arrive as `server_api`; skipping them keeps one event per transition.
        if (event.source.type === 'server_api') {
          return;
        }
        const transition = getInvestigationStatusTransition(event.changes);
        if (!transition) {
          return;
        }
        runBounded('metadata_updated', event.conversationId, () =>
          reportStatusTransition(event, transition)
        );
      } catch (error) {
        logFailure('metadata_updated', event.conversationId, error);
      }
    },
    stop: () => {
      state.stopped = true;
    },
  };
};
