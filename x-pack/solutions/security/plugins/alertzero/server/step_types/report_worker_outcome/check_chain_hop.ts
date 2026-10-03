/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERTZERO_MANAGED_WORKFLOW_OWNER_ID } from '../../../common/constants';
import type { ReportWorkerOutcomeSkipReason } from './skip_reasons';
import type { WorkerChainExecution } from './worker_chain_execution';

/** Why a persisted execution of the chain disqualifies it, if it does. */
export const checkChainHop = (
  execution: WorkerChainExecution,
  spaceId: string
): ReportWorkerOutcomeSkipReason | undefined => {
  // The execution search also matches legacy documents with no `spaceId`, so compare explicitly.
  if (execution.spaceId !== spaceId) {
    return 'lineage_unavailable';
  }
  if (execution.isTestRun) {
    return 'test_run';
  }
  if (!execution.managed || execution.managedBy !== ALERTZERO_MANAGED_WORKFLOW_OWNER_ID) {
    return 'not_managed';
  }
  return undefined;
};
