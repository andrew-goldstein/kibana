/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetWorkerChainExecution, WorkerChainExecution } from './worker_chain_execution';
import { withTimeout } from './with_timeout';

export interface ReadChainExecutionParams {
  getExecution: GetWorkerChainExecution;
  hopTimeoutMs: number;
}

/**
 * Reads one persisted execution of the chain, or `null` when it is missing, hidden, answers with
 * another id, fails, or outlives `hopTimeoutMs`. Never throws.
 */
export const readChainExecution = async (
  { getExecution, hopTimeoutMs }: ReadChainExecutionParams,
  executionId: string
): Promise<WorkerChainExecution | null> => {
  try {
    const execution = await withTimeout(getExecution(executionId), hopTimeoutMs);
    return execution?.id === executionId ? execution : null;
  } catch {
    return null;
  }
};
