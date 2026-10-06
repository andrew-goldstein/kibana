/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
} from './constants';
import COVERAGE_REVIEW_YAML from './coverage_review.yaml';
import COVERAGE_WORKER_YAML from './coverage_worker.yaml';
import RULE_CREATION_YAML from './rule_creation.yaml';
import RULE_PREVIEW_YAML from './rule_preview.yaml';
import RULE_TUNING_REVIEW_YAML from './rule_tuning_review.yaml';
import RULE_TUNING_WORKER_YAML from './rule_tuning_worker.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID = 'system-security-coverage-review';
export const ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID = 'system-security-coverage-worker';
export const ALERTZERO_RULE_PREVIEW_WORKFLOW_ID = 'system-security-rule-preview';
export const ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID = 'system-security-rule-tuning-worker';
export const ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID = 'system-security-rule-tuning-review';
export const ALERTZERO_RULE_CREATION_WORKFLOW_ID = 'system-security-rule-creation';

/**
 * Version 7 carries `report_investigation_closed_resolved` and
 * `report_investigation_closed_dismissed`, which report the Worker's own Investigation closes,
 * and `report_review_completed`, which reports the review's outcome, through
 * `alertzero.reportWorkerOutcome`. Main is at 5 and the Attack Discovery Worker telemetry change
 * takes it to 6. The bump makes the upgrade visible in `managedVersion`; the content hash alone
 * would also apply it.
 */
export const ALERTZERO_COVERAGE_REVIEW_WORKFLOW = {
  billable: false,
  id: ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID,
  management: ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 7,
  yaml: COVERAGE_REVIEW_YAML,
} as const satisfies ManagedWorkflowDefinition;

/**
 * Version 5 carries `report_worker_run_completed`, which reports the sweep's outcome through
 * `alertzero.reportWorkerOutcome`. The bump makes the upgrade visible in `managedVersion`; the
 * content hash alone would also apply it.
 */
export const ALERTZERO_COVERAGE_WORKER_WORKFLOW = {
  billable: false,
  id: ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID,
  management: ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 5,
  yaml: COVERAGE_WORKER_YAML,
} as const satisfies ManagedWorkflowDefinition;

export const ALERTZERO_RULE_PREVIEW_WORKFLOW = {
  billable: false,
  id: ALERTZERO_RULE_PREVIEW_WORKFLOW_ID,
  management: ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 2,
  yaml: RULE_PREVIEW_YAML,
} as const satisfies ManagedWorkflowDefinition;

/**
 * Version 28 carries `report_worker_run_completed`, which reports the sweep's outcome through
 * `alertzero.reportWorkerOutcome`. The bump makes the upgrade visible in `managedVersion`; the
 * content hash alone would also apply it.
 */
export const ALERTZERO_RULE_TUNING_WORKER_WORKFLOW = {
  billable: false,
  id: ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID,
  management: ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 28,
  yaml: RULE_TUNING_WORKER_YAML,
} as const satisfies ManagedWorkflowDefinition;

/**
 * Version 29 carries `report_investigation_closed_declined`, `report_investigation_closed_applied`
 * and `report_investigation_closed_dismissed`, which report the Worker's own Investigation closes,
 * and `report_review_completed_declined` and `report_review_completed`, which report the review's
 * outcome, through `alertzero.reportWorkerOutcome`. The bump makes the upgrade visible in
 * `managedVersion`; the content hash alone would also apply it.
 */
export const ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW = {
  billable: false,
  id: ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID,
  management: ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 29,
  yaml: RULE_TUNING_REVIEW_YAML,
} as const satisfies ManagedWorkflowDefinition;

export const ALERTZERO_RULE_CREATION_WORKFLOW = {
  billable: false,
  id: ALERTZERO_RULE_CREATION_WORKFLOW_ID,
  management: ALERTZERO_RULE_WORKFLOW_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 4,
  yaml: RULE_CREATION_YAML,
} as const satisfies ManagedWorkflowDefinition;
