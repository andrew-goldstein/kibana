/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DismissReason } from '@kbn/proposals-common';
import { computeElapsedMs } from './compute_elapsed_ms';
import type { InvestigationClosedByClass, InvestigationReopenedByClass } from './constants';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS, INVESTIGATION_STATUS_FIELD } from './constants';
import type { AgenticInvestigationsTelemetryEvent } from './event_types';

export interface BuildInvestigationStatusEventsParams {
  /** The fields the status write really changed, as reported by `patchMetadata`. */
  changedFields: readonly string[];
  closedBy: InvestigationClosedByClass;
  /** The Investigation's `created_at`. */
  createdAt: string | undefined;
  /** The reason sent with the close, applied to any pending proposals. */
  dismissReason: DismissReason | undefined;
  /** Proposals this close attempt actually dismissed; `dismiss_reason` ships only when above 0. */
  dismissedProposalCount: number;
  investigationId: string;
  isDefaultSpace: boolean;
  nextStatus: 'open' | 'closed';
  now: number;
  /** Proposals still pending when the close was requested. */
  pendingProposalCount: number;
  /** The status read before the write; anything but a string means it had none. */
  previousStatus: unknown;
  reopenedBy: InvestigationReopenedByClass;
  /** The workflow run making the change; ships only for the workflow classes. */
  workflowExecutionId: string | undefined;
}

/** The classes a workflow run makes, the only ones that carry `workflow_execution_id`. */
const WORKFLOW_CLASSES: ReadonlySet<InvestigationClosedByClass | InvestigationReopenedByClass> =
  new Set(['workflow_request', 'workflow_step']);

const toWorkflowExecutionIdField = (
  byClass: InvestigationClosedByClass | InvestigationReopenedByClass,
  workflowExecutionId: string | undefined
): { workflow_execution_id?: string } =>
  workflowExecutionId !== undefined && WORKFLOW_CLASSES.has(byClass)
    ? { workflow_execution_id: workflowExecutionId }
    : {};

/**
 * Builds the lifecycle event for a completed Investigation status write: `_closed`, `_reopened`
 * (it had a status), or nothing when the write did not change the status or opened an
 * Investigation that had none.
 */
export const buildInvestigationStatusEvents = ({
  changedFields,
  closedBy,
  createdAt,
  dismissReason,
  dismissedProposalCount,
  investigationId,
  isDefaultSpace,
  nextStatus,
  now,
  pendingProposalCount,
  previousStatus,
  reopenedBy,
  workflowExecutionId,
}: BuildInvestigationStatusEventsParams): readonly AgenticInvestigationsTelemetryEvent[] => {
  if (!changedFields.includes(INVESTIGATION_STATUS_FIELD)) {
    return [];
  }

  const identity = { investigation_id: investigationId, is_default_space: isDefaultSpace };

  if (nextStatus === 'open') {
    // A changed status that was a string was `closed`, even when a stale read said `open`.
    // Investigations are created open, so a first status is not a reopen and is not reported.
    return typeof previousStatus === 'string'
      ? [
          {
            eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened,
            payload: {
              ...identity,
              reopened_by_class: reopenedBy,
              ...toWorkflowExecutionIdField(reopenedBy, workflowExecutionId),
            },
          },
        ]
      : [];
  }

  const timeOpenMs = computeElapsedMs({ from: createdAt, now });

  return [
    {
      eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed,
      payload: {
        ...identity,
        closed_by_class: closedBy,
        ...(dismissedProposalCount > 0 && dismissReason ? { dismiss_reason: dismissReason } : {}),
        proposals_dismissed_at_close: dismissedProposalCount,
        proposals_open_at_close: pendingProposalCount,
        ...(timeOpenMs !== undefined ? { time_open_ms: timeOpenMs } : {}),
        ...toWorkflowExecutionIdField(closedBy, workflowExecutionId),
      },
    },
  ];
};
