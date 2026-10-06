/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ESCALATION_STATUS_FIELD } from '../../common/escalations/constants';
import { computeElapsedMs } from './compute_elapsed_ms';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { AgenticInvestigationsTelemetryEvent } from './event_types';

export interface BuildEscalationClosedEventsParams {
  /** The fields the status write really changed, as reported by `patchMetadata`. */
  changedFields: readonly string[];
  /** The escalation's `created_at`. */
  createdAt: string | undefined;
  escalationId: string;
  /** Linked investigations the close cascade closed. */
  investigationsClosed: number;
  isDefaultSpace: boolean;
  linkedInvestigationCount: number;
  nextStatus: 'open' | 'closed';
  now: number;
}

/** Builds `_escalation_closed` when the status write really closed the escalation. */
export const buildEscalationClosedEvents = ({
  changedFields,
  createdAt,
  escalationId,
  investigationsClosed,
  isDefaultSpace,
  linkedInvestigationCount,
  nextStatus,
  now,
}: BuildEscalationClosedEventsParams): readonly AgenticInvestigationsTelemetryEvent[] => {
  if (nextStatus !== 'closed' || !changedFields.includes(ESCALATION_STATUS_FIELD)) {
    return [];
  }

  const timeOpenMs = computeElapsedMs({ from: createdAt, now });

  return [
    {
      eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed,
      payload: {
        escalation_id: escalationId,
        investigations_closed: investigationsClosed,
        is_default_space: isDefaultSpace,
        linked_investigation_count: linkedInvestigationCount,
        ...(timeOpenMs !== undefined ? { time_open_ms: timeOpenMs } : {}),
      },
    },
  ];
};
