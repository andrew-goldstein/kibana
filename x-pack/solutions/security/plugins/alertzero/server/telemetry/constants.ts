/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SystemSecurityWorkerCatalogEntry, WatchAutonomyLevel } from '@kbn/alertzero-common';

export const ALERTZERO_TELEMETRY_PREFIX = 'alertzero';

/** Every AlertZero EBT event type, named `<plugin>_<object>_<verb>`. */
export const ALERTZERO_TELEMETRY_EVENTS = {
  AdWorkerRunCompleted: `${ALERTZERO_TELEMETRY_PREFIX}_ad_worker_run_completed`,
  AdWorkerReviewStarted: `${ALERTZERO_TELEMETRY_PREFIX}_ad_worker_review_started`,
  AdWorkerAnalysisCompleted: `${ALERTZERO_TELEMETRY_PREFIX}_ad_worker_analysis_completed`,
  AdWorkerHandoffResolved: `${ALERTZERO_TELEMETRY_PREFIX}_ad_worker_handoff_resolved`,
  WorkerSettingsChanged: `${ALERTZERO_TELEMETRY_PREFIX}_worker_settings_changed`,
  WorkerActivated: `${ALERTZERO_TELEMETRY_PREFIX}_worker_activated`,
  AutonomySnapshot: `${ALERTZERO_TELEMETRY_PREFIX}_autonomy_snapshot`,
  FeatureFlagsSnapshot: `${ALERTZERO_TELEMETRY_PREFIX}_feature_flags_snapshot`,
  InvestigationCreated: `${ALERTZERO_TELEMETRY_PREFIX}_investigation_created`,
  InvestigationClosed: `${ALERTZERO_TELEMETRY_PREFIX}_investigation_closed`,
  InvestigationReopened: `${ALERTZERO_TELEMETRY_PREFIX}_investigation_reopened`,
} as const;

export type AlertZeroTelemetryEventType =
  (typeof ALERTZERO_TELEMETRY_EVENTS)[keyof typeof ALERTZERO_TELEMETRY_EVENTS];

/** Shipped as `worker_id` for any workflow outside the Worker catalog. */
export const OTHER_WORKER_ID = 'other' as const;

/** Shipped as `watch_tag` for any workflow outside the Worker catalog. */
export const OTHER_WATCH_TAG = 'other' as const;

export type AlertZeroWorkerId = SystemSecurityWorkerCatalogEntry['id'] | typeof OTHER_WORKER_ID;

export type AlertZeroWatchTag =
  | SystemSecurityWorkerCatalogEntry['watchTag']
  | typeof OTHER_WATCH_TAG;

export type AlertZeroAutonomyLevel = WatchAutonomyLevel;

/**
 * Normalizes the autonomy dial: `auto_accept` when the Worker's gate auto-approves (the review
 * passes `auto_approve: autonomy == 'supervised'`), `gated` when a human decides.
 */
export const AUTONOMY_MODES = ['gated', 'auto_accept'] as const;

export type AlertZeroAutonomyMode = (typeof AUTONOMY_MODES)[number];

/**
 * How the root execution was started, read from its persisted `triggeredBy`. `other` is a custom
 * provenance string with no event dispatch evidence; `unknown` is a missing value.
 */
export const TRIGGER_TYPES = [
  'manual',
  'scheduled',
  'alert',
  'workflow_step',
  'event',
  'other',
  'unknown',
] as const;

export type AlertZeroTriggerType = (typeof TRIGGER_TYPES)[number];

/**
 * Worker settings that `alertzero_worker_settings_changed` may report, one event each. `enabled`
 * is the Worker's enabled state, not a settings key. `other` stands in for any settings key not on
 * this allowlist, and never carries values.
 */
export const WORKER_SETTINGS = [
  'autonomy',
  'schedule_interval',
  'extras',
  'enabled',
  'other',
] as const;

export type AlertZeroWorkerSetting = (typeof WORKER_SETTINGS)[number];

/** The previous and next values of an `enabled` change: the boolean as a keyword string. */
export const WORKER_ENABLED_VALUES = ['true', 'false'] as const;

export type AlertZeroWorkerEnabledValue = (typeof WORKER_ENABLED_VALUES)[number];

/**
 * Half-open ranges a Worker schedule interval is reported in, so the raw interval never ships.
 * `unknown` is an interval that does not parse.
 */
export const SCHEDULE_INTERVAL_BUCKETS = [
  'lt_15m',
  '15m_to_lt_1h',
  '1h_to_lt_6h',
  '6h_to_lt_24h',
  '24h_to_lt_7d',
  'gte_7d',
  'unknown',
] as const;

export type AlertZeroScheduleIntervalBucket = (typeof SCHEDULE_INTERVAL_BUCKETS)[number];

/** Who created, closed or reopened an Investigation, classified from the lifecycle source. */
export const INVESTIGATION_ACTOR_CLASSES = ['worker', 'custom_workflow', 'agent', 'user'] as const;

export type AlertZeroInvestigationActorClass = (typeof INVESTIGATION_ACTOR_CLASSES)[number];

/** Mirrors the `investigation` conversation template's `severity` SELECT options. */
export const INVESTIGATION_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export type AlertZeroInvestigationSeverity = (typeof INVESTIGATION_SEVERITIES)[number];

/** Mirrors the `investigation` conversation template's `close_reason` SELECT options. */
export const INVESTIGATION_CLOSE_REASONS = [
  'false_positive',
  'benign',
  'resolved',
  'duplicate',
  'other',
] as const;

export type AlertZeroInvestigationCloseReason = (typeof INVESTIGATION_CLOSE_REASONS)[number];
