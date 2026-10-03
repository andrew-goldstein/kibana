/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EscalationVisibility } from '../../common/escalations/escalation';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { AgenticInvestigationsTelemetryEvent } from './event_types';

export interface BuildEscalationCreatedEventParams {
  /**
   * User profile uids assigned at creation (at least one). A private escalation's access list is
   * built from them, so only their distinct count ships.
   */
  assignees: readonly string[];
  escalationId: string;
  /** The Investigation the escalation was opened from. */
  investigationId: string;
  isDefaultSpace: boolean;
  linkedInvestigationCount: number;
  visibility: EscalationVisibility;
}

/** Builds `_escalation_created` from what the create wrote. */
export const buildEscalationCreatedEvent = ({
  assignees,
  escalationId,
  investigationId,
  isDefaultSpace,
  linkedInvestigationCount,
  visibility,
}: BuildEscalationCreatedEventParams): AgenticInvestigationsTelemetryEvent => ({
  eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationCreated,
  payload: {
    access_mode: visibility,
    escalation_id: escalationId,
    investigation_id: investigationId,
    is_default_space: isDefaultSpace,
    linked_investigations_at_create: linkedInvestigationCount,
    participant_count: new Set(assignees).size,
  },
});
