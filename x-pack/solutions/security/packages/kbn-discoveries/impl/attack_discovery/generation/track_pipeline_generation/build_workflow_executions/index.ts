/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowExecutionsTracking } from '../../types';
import type { PipelinePhaseRuns } from '../types';

/** Returns the per-phase run references the event log records for a pipeline run. */
export const buildWorkflowExecutions = (runs: PipelinePhaseRuns): WorkflowExecutionsTracking => ({
  alertRetrieval: runs.alertRetrieval != null ? [runs.alertRetrieval.tracking] : null,
  gate: null,
  generation: runs.generation?.tracking ?? null,
  validation: runs.validation?.tracking ?? null,
});
