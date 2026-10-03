/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StepContext } from '@kbn/workflows';
import { checkChainHop } from './check_chain_hop';
import { getParentExecutionId } from './get_parent_execution_id';
import { readChainExecution } from './read_chain_execution';
import { verifyCatalogRoot } from './verify_catalog_root';
import type { GetWorkerChainExecution, WorkerChainVerification } from './worker_chain_execution';

export interface VerifyWorkerRootParams {
  abortSignal: AbortSignal;
  getExecution: GetWorkerChainExecution;
  hopTimeoutMs: number;
  /** The root lineage the engine carries in the reporting execution's context. */
  root: NonNullable<StepContext['root']>;
  spaceId: string;
}

const LINEAGE_UNAVAILABLE: WorkerChainVerification = {
  reason: 'lineage_unavailable',
  verified: false,
};

/**
 * Verifies the Worker run from the root execution the engine names, with one persisted read: the
 * root must be the named workflow's execution, in the same space, a non-test execution AlertZero
 * manages, have no parent, and be a catalog Worker. Caller verification is best-effort until the
 * engine exposes a trusted execution identity.
 */
export const verifyWorkerRoot = async ({
  abortSignal,
  getExecution,
  hopTimeoutMs,
  root,
  spaceId,
}: VerifyWorkerRootParams): Promise<WorkerChainVerification> => {
  if (abortSignal.aborted) {
    return { reason: 'aborted', verified: false };
  }

  const execution = await readChainExecution({ getExecution, hopTimeoutMs }, root.executionId);
  if (!execution || execution.workflowId !== root.workflowId) {
    return LINEAGE_UNAVAILABLE;
  }
  const hopFailure = checkChainHop(execution, spaceId);
  if (hopFailure) {
    return { reason: hopFailure, verified: false };
  }
  if (getParentExecutionId(execution.context)) {
    return LINEAGE_UNAVAILABLE;
  }
  return verifyCatalogRoot(execution);
};
