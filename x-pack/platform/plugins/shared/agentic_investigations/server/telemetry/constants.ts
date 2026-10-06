/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX = 'agentic_investigations';

/** Every agentic_investigations EBT event type, named `<plugin>_<object>_<verb>`. */
export const AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS = {
  InvestigationClosed: `${AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX}_investigation_closed`,
  InvestigationReopened: `${AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX}_investigation_reopened`,
  EscalationCreated: `${AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX}_escalation_created`,
  EscalationInvestigationLinked: `${AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX}_escalation_investigation_linked`,
  EscalationClosed: `${AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX}_escalation_closed`,
} as const;

export type AgenticInvestigationsTelemetryEventType =
  (typeof AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS)[keyof typeof AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS];

/**
 * How an Investigation was closed through the Agentic Investigations API: `direct` is a close
 * requested directly through this plugin's status API or service (by a person in the UI, an API
 * key or automation), and `escalation_cascade` is the close of an escalation it is linked to.
 * Workflow closes bypass this plugin and are not reported here.
 */
export const INVESTIGATION_CLOSED_BY_CLASSES = ['direct', 'escalation_cascade'] as const;

export type InvestigationClosedByClass = (typeof INVESTIGATION_CLOSED_BY_CLASSES)[number];

/**
 * Mirrors the `investigation` conversation template's `close_reason` SELECT options, owned by
 * agent_builder_platform. Any other stored value is omitted rather than shipped.
 */
export const INVESTIGATION_CLOSE_REASONS = [
  'false_positive',
  'benign',
  'resolved',
  'duplicate',
  'other',
] as const;

export type InvestigationCloseReason = (typeof INVESTIGATION_CLOSE_REASONS)[number];

/** The metadata field of the `investigation` template that holds the close reason. */
export const INVESTIGATION_CLOSE_REASON_FIELD = 'close_reason' as const;

/** The metadata field of the `investigation` template that holds the open/closed status. */
export const INVESTIGATION_STATUS_FIELD = 'status' as const;
