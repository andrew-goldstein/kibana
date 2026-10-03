/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS,
  AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX,
  INVESTIGATION_CLOSE_REASONS,
  INVESTIGATION_CLOSED_BY_CLASSES,
} from './constants';
export type {
  AgenticInvestigationsTelemetryEventType,
  InvestigationCloseReason,
  InvestigationClosedByClass,
} from './constants';
export { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES } from './event_types';
export type {
  AgenticInvestigationsEscalationClosedPayload,
  AgenticInvestigationsEscalationCreatedPayload,
  AgenticInvestigationsEscalationInvestigationLinkedPayload,
  AgenticInvestigationsInvestigationClosedPayload,
  AgenticInvestigationsInvestigationOpenedPayload,
  AgenticInvestigationsInvestigationReopenedPayload,
  AgenticInvestigationsTelemetryEvent,
  AgenticInvestigationsTelemetryEventPayloads,
} from './event_types';
export { registerAgenticInvestigationsTelemetryEvents } from './register_telemetry_events';
export { createAgenticInvestigationsTelemetryReporter, safeReportEvent } from './safe_report_event';
export type {
  AgenticInvestigationsTelemetryAnalytics,
  AgenticInvestigationsTelemetryReporter,
  SafeReportEventParams,
} from './safe_report_event';
export { reportTelemetryEvents } from './report_telemetry_events';
export { buildInvestigationStatusEvents } from './build_investigation_status_events';
export { buildEscalationCreatedEvent } from './build_escalation_created_event';
export { buildEscalationInvestigationLinkedEvents } from './build_escalation_investigation_linked_events';
export { buildEscalationClosedEvents } from './build_escalation_closed_events';
export { isDefaultSpace } from './is_default_space';
