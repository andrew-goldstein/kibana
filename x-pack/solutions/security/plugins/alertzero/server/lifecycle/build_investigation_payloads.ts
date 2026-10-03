/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationLifecycleCreatedEvent } from '@kbn/agent-builder-server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type {
  AlertZeroInvestigationClosedPayload,
  AlertZeroInvestigationCreatedPayload,
  AlertZeroInvestigationReopenedPayload,
  AlertZeroWorkerId,
} from '../telemetry';
import { INVESTIGATION_CLOSE_REASONS, INVESTIGATION_SEVERITIES } from '../telemetry';
import type { InvestigationActor } from './classify_investigation_actor';
import { INVESTIGATION_CLOSE_REASON_FIELD, INVESTIGATION_SEVERITY_FIELD } from './constants';
import { pickVocabularyValue } from './pick_vocabulary_value';

export interface BuildInvestigationPayloadParams {
  actor: InvestigationActor;
  event: Pick<ConversationLifecycleCreatedEvent, 'changes' | 'conversationId' | 'spaceId'>;
}

const buildIdentity = ({
  conversationId,
  spaceId,
}: BuildInvestigationPayloadParams['event']): {
  investigation_id: string;
  is_default_space: boolean;
} => ({ investigation_id: conversationId, is_default_space: spaceId === DEFAULT_SPACE_ID });

const buildWorkerId = ({
  actorClass,
  workerId,
}: InvestigationActor): { worker_id?: AlertZeroWorkerId } =>
  actorClass === 'worker' && workerId ? { worker_id: workerId } : {};

const buildSeverity = ({
  changes,
}: BuildInvestigationPayloadParams['event']): Pick<
  AlertZeroInvestigationCreatedPayload,
  'severity'
> => {
  const severity = pickVocabularyValue(
    changes[INVESTIGATION_SEVERITY_FIELD]?.next,
    INVESTIGATION_SEVERITIES
  );
  return severity ? { severity } : {};
};

/** Builds `alertzero_investigation_created`; the severity is omitted unless it is a template option. */
export const buildInvestigationCreatedPayload = ({
  actor,
  event,
}: BuildInvestigationPayloadParams): AlertZeroInvestigationCreatedPayload => ({
  ...buildIdentity(event),
  created_by_class: actor.actorClass,
  ...buildSeverity(event),
  ...buildWorkerId(actor),
});

/**
 * Builds `alertzero_investigation_closed`. The close reason and severity are the values the
 * closing write set, since the lifecycle event carries only changed fields.
 */
export const buildInvestigationClosedPayload = ({
  actor,
  event,
}: BuildInvestigationPayloadParams): AlertZeroInvestigationClosedPayload => {
  const closeReason = pickVocabularyValue(
    event.changes[INVESTIGATION_CLOSE_REASON_FIELD]?.next,
    INVESTIGATION_CLOSE_REASONS
  );
  return {
    ...buildIdentity(event),
    ...(closeReason ? { close_reason: closeReason } : {}),
    closed_by_class: actor.actorClass,
    ...buildSeverity(event),
    ...buildWorkerId(actor),
  };
};

/** Builds `alertzero_investigation_reopened`. */
export const buildInvestigationReopenedPayload = ({
  actor,
  event,
}: BuildInvestigationPayloadParams): AlertZeroInvestigationReopenedPayload => ({
  ...buildIdentity(event),
  reopened_by_class: actor.actorClass,
  ...buildWorkerId(actor),
});
