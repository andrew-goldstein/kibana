/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ESCALATION_LINKED_INVESTIGATIONS_FIELD } from '../../common/escalations/constants';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { AgenticInvestigationsTelemetryEvent } from './event_types';

export interface BuildEscalationInvestigationLinkedEventsParams {
  /** The fields the link write really changed, as reported by `patchMetadata`. */
  changedFields: readonly string[];
  escalationId: string;
  isDefaultSpace: boolean;
  /** The linked investigation ids the write stored. */
  nextIds: readonly string[];
  /** The linked investigation ids loaded before the write. */
  previousIds: readonly string[];
}

/** Builds one `_escalation_investigation_linked` per id the write newly linked. */
export const buildEscalationInvestigationLinkedEvents = ({
  changedFields,
  escalationId,
  isDefaultSpace,
  nextIds,
  previousIds,
}: BuildEscalationInvestigationLinkedEventsParams): readonly AgenticInvestigationsTelemetryEvent[] => {
  if (!changedFields.includes(ESCALATION_LINKED_INVESTIGATIONS_FIELD)) {
    return [];
  }

  const previous = new Set(previousIds);

  return [...new Set(nextIds)]
    .filter((id) => !previous.has(id))
    .map((investigationId) => ({
      eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationInvestigationLinked,
      payload: {
        escalation_id: escalationId,
        investigation_id: investigationId,
        is_default_space: isDefaultSpace,
        linked_investigation_count: nextIds.length,
      },
    }));
};
