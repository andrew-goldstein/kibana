/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Why the step reported nothing. These go to the AlertZero server log only, never to the
 * workflow event log or the step output.
 */
export const REPORT_INVESTIGATION_STATUS_CHANGE_SKIP_REASONS = [
  'invalid_input',
  'aborted',
  'test_run',
  'not_conversation_trigger',
  'excluded_source',
  'opted_out',
  'not_managed',
  'lineage_unavailable',
  'read_failed',
  'not_found',
  'not_investigation',
  'unknown_status',
  'report_error',
] as const;

export type ReportInvestigationStatusChangeSkipReason =
  (typeof REPORT_INVESTIGATION_STATUS_CHANGE_SKIP_REASONS)[number];

/** Skips that point at a broken listener YAML or telemetry wiring, rather than an expected case. */
export const WARN_SKIP_REASONS: ReadonlySet<ReportInvestigationStatusChangeSkipReason> = new Set([
  'invalid_input',
  'report_error',
]);
