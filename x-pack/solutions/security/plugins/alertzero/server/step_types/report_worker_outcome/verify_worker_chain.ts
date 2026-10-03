/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { checkChainHop } from './check_chain_hop';
import { getParentExecutionId } from './get_parent_execution_id';
import { readChainExecution } from './read_chain_execution';
import type { ReportWorkerOutcomeSkipReason } from './skip_reasons';
import { verifyCatalogRoot } from './verify_catalog_root';
import type { GetWorkerChainExecution, WorkerChainVerification } from './worker_chain_execution';

/** Parent hops the walk follows at most; matches the engine's default `maxWorkflowDepth`. */
export const MAX_LINEAGE_HOPS = 10;

export interface VerifyWorkerChainParams {
  abortSignal: AbortSignal;
  /** The reporting execution; the walk starts from its persisted document. */
  executionId: string;
  getExecution: GetWorkerChainExecution;
  hopTimeoutMs: number;
  spaceId: string;
}

const skip = (reason: ReportWorkerOutcomeSkipReason): WorkerChainVerification => ({
  reason,
  verified: false,
});

const walk = async (
  params: VerifyWorkerChainParams,
  executionId: string,
  visited: readonly string[]
): Promise<WorkerChainVerification> => {
  const { abortSignal, spaceId } = params;
  if (abortSignal.aborted) {
    return skip('aborted');
  }

  const execution = await readChainExecution(params, executionId);
  if (!execution) {
    return skip('lineage_unavailable');
  }
  const hopFailure = checkChainHop(execution, spaceId);
  if (hopFailure) {
    return skip(hopFailure);
  }

  const parentId = getParentExecutionId(execution.context);
  if (!parentId) {
    return verifyCatalogRoot(execution);
  }

  const chain = [...visited, executionId];
  if (chain.includes(parentId) || visited.length >= MAX_LINEAGE_HOPS) {
    return skip('lineage_unavailable');
  }
  return walk(params, parentId, chain);
};

/**
 * Walks a reporting execution's persisted ancestors up to its root, requiring every hop to be a
 * non-test execution AlertZero manages in the same space, and the root to be a catalog Worker. The
 * fallback for a chain that started before the engine carried its root lineage. Caller
 * verification is best-effort until the engine exposes a trusted execution identity.
 */
export const verifyWorkerChain = (
  params: VerifyWorkerChainParams
): Promise<WorkerChainVerification> => walk(params, params.executionId, []);
