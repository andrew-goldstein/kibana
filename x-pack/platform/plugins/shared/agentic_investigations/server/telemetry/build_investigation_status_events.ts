/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DismissReason } from '@kbn/proposals-common';
import { computeElapsedMs } from './compute_elapsed_ms';
import type { InvestigationClosedByClass, InvestigationCloseReason } from './constants';
import {
  AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS,
  INVESTIGATION_CLOSE_REASON_FIELD,
  INVESTIGATION_CLOSE_REASONS,
  INVESTIGATION_STATUS_FIELD,
} from './constants';
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
  /** The Investigation's metadata after the write. */
  metadata: Readonly<Record<string, unknown>> | undefined;
  nextStatus: 'open' | 'closed';
  now: number;
  /** Proposals still pending when the close was requested. */
  pendingProposalCount: number;
  /** The status read before the write; anything but a string means it had none. */
  previousStatus: unknown;
}

const isInvestigationCloseReason = (value: unknown): value is InvestigationCloseReason =>
  INVESTIGATION_CLOSE_REASONS.some((reason) => reason === value);

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
  metadata,
  nextStatus,
  now,
  pendingProposalCount,
  previousStatus,
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
            payload: identity,
          },
        ]
      : [];
  }

  const closeReason = metadata?.[INVESTIGATION_CLOSE_REASON_FIELD];
  const timeOpenMs = computeElapsedMs({ from: createdAt, now });

  return [
    {
      eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed,
      payload: {
        ...identity,
        ...(isInvestigationCloseReason(closeReason) ? { close_reason: closeReason } : {}),
        closed_by_class: closedBy,
        ...(dismissedProposalCount > 0 && dismissReason ? { dismiss_reason: dismissReason } : {}),
        proposals_open_at_close: pendingProposalCount,
        ...(timeOpenMs !== undefined ? { time_open_ms: timeOpenMs } : {}),
      },
    },
  ];
};
