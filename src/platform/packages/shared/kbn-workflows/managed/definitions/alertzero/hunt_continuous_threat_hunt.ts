/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID, ALERTZERO_WORKER_MANAGEMENT } from './constants';
import HUNT_CONTINUOUS_THREAT_HUNT_YAML from './hunt_continuous_threat_hunt.yaml';
import { type HuntWorkerTemplateValues, renderHuntWorkerYaml } from './worker_template_values';
import type { ManagedWorkflowDefinition } from '../../types';

export const ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID =
  'system-security-hunt-continuous-threat-hunt';

/**
 * Version 3 carries `record_report_outcome`, the last step of each report's branch, and
 * `report_worker_run_completed`, which reports the sweep's outcome through
 * `alertzero.reportWorkerOutcome`, and passes `tier2Invoked` to packaging. The YAML is imported,
 * so the bump is what delivers it to spaces that already installed the Worker.
 */
export const ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW = {
  billable: false,
  id: ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID,
  management: ALERTZERO_WORKER_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 3,
  yamlTemplate: (values: HuntWorkerTemplateValues): string =>
    renderHuntWorkerYaml(HUNT_CONTINUOUS_THREAT_HUNT_YAML, values),
} as const satisfies ManagedWorkflowDefinition<HuntWorkerTemplateValues>;
