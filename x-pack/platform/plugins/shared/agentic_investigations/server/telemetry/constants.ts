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
 * requested through this plugin's status API or service by anything other than a workflow (a
 * person in the UI, an API key or other automation), `escalation_cascade` is the close of an
 * escalation it is linked to, and `workflow_request` is a workflow's `kibana.request` step calling
 * the status route. Workflow steps that write the status through Agent Builder directly bypass
 * this plugin and are not reported here.
 */
export const INVESTIGATION_CLOSED_BY_CLASSES = [
  'direct',
  'escalation_cascade',
  'workflow_request',
] as const;

export type InvestigationClosedByClass = (typeof INVESTIGATION_CLOSED_BY_CLASSES)[number];

/**
 * How an Investigation was reopened through the Agentic Investigations API: `direct` is a reopen
 * requested through this plugin's status API or service by anything other than a workflow,
 * `workflow_step` is any workflow running the `investigations.reopen` step (for example one that
 * reopens an Investigation before filing a proposal for it), and `workflow_request` is a
 * workflow's `kibana.request` step calling the status route.
 */
export const INVESTIGATION_REOPENED_BY_CLASSES = [
  'direct',
  'workflow_step',
  'workflow_request',
] as const;

export type InvestigationReopenedByClass = (typeof INVESTIGATION_REOPENED_BY_CLASSES)[number];

/** The metadata field of the `investigation` template that holds the open/closed status. */
export const INVESTIGATION_STATUS_FIELD = 'status' as const;
