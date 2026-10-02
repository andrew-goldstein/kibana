/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  ACTION_OUTCOMES,
  CUSTOM_ACTION_ID,
  DECISION_SOURCES,
  DURATION_BUCKETS,
  EXPIRES_IN_BUCKETS,
  EXPIRY_REASONS,
  FAILURE_SOURCES,
  KNOWN_CATEGORIES,
  NO_DEADLINE_BUCKET,
  OTHER_CATEGORY,
  PROPOSALS_TELEMETRY_EVENTS,
  PROPOSALS_TELEMETRY_PREFIX,
  RESUME_REJECTED_REASONS,
  TELEMETRY_CATEGORIES,
  UNKNOWN_DECISION_SOURCE,
} from './constants';
export type {
  ProposalActionOutcome,
  ProposalDurationBucket,
  ProposalExpiresInBucket,
  ProposalExpiryReason,
  ProposalFailureSource,
  ProposalReportedDecisionSource,
  ProposalResumeRejectedReason,
  ProposalTelemetryCategory,
  ProposalsTelemetryEventType,
} from './constants';
export { PROPOSALS_TELEMETRY_EVENT_TYPES } from './event_types';
export type {
  ProposalsActionExecutedPayload,
  ProposalsCallerFields,
  ProposalsProposalCreatedPayload,
  ProposalsProposalDecidedPayload,
  ProposalsProposalIdFields,
  ProposalsProposalResumeRejectedPayload,
  ProposalsProposalRetriedPayload,
  ProposalsProposalRevisedPayload,
  ProposalsProposalStatusChangedPayload,
  ProposalsTelemetryEventPayloads,
} from './event_types';
export { readTelemetryOptIn } from './read_telemetry_opt_in';
export { registerProposalsTelemetryEvents } from './register_telemetry_events';
export { createProposalsTelemetryReporter, safeReportEvent } from './safe_report_event';
export type {
  ProposalsTelemetryAnalytics,
  ProposalsTelemetryReporter,
  SafeReportEventParams,
} from './safe_report_event';
export {
  bucketDuration,
  DURATION_BUCKET_UPPER_BOUNDS_MS,
  LONGEST_DURATION_BUCKET,
} from './bucket_duration';
export { buildCreatedPayload } from './build_created_payload';
export { buildResumeRejectedPayload } from './build_resume_rejected_payload';
export { buildRetriedPayload } from './build_retried_payload';
export { buildRevisedPayload } from './build_revised_payload';
export { buildUpdateEvents } from './build_update_events';
export { bucketExpiresIn } from './bucket_expires_in';
export { toResumeRejectedReason } from './to_resume_rejected_reason';
export { toTelemetryActionId } from './to_telemetry_action_id';
export { toTelemetryCategory } from './to_telemetry_category';
export { toTelemetryRecord } from './to_telemetry_record';
export type {
  ProposalTelemetryRecord,
  ProposalsTelemetryEvent,
  ProposalWriteContext,
} from './types';
