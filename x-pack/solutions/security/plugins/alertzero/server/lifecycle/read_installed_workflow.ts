/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';
import type {
  ManagedWorkflowInstanceState,
  ManagedWorkflowStateApi,
} from '@kbn/workflows/server/types';
import { withTimeout } from '../step_types/report_worker_outcome/with_timeout';

export interface ReadInstalledWorkflowParams {
  /** AlertZero's owner-bound managed workflows client, once start has resolved it. */
  getManagedWorkflowState: () => Promise<ManagedWorkflowStateApi | undefined>;
  spaceId: string;
  timeoutMs: number;
  workflowId: string;
}

/**
 * Reads the workflow AlertZero installed with this id, in the space, else in the global space its
 * shared Workers live in. Returns `null` when AlertZero owns no such workflow, and rejects when a
 * lookup fails or outlives `timeoutMs`.
 */
export const readInstalledWorkflow = async ({
  getManagedWorkflowState,
  spaceId,
  timeoutMs,
  workflowId,
}: ReadInstalledWorkflowParams): Promise<ManagedWorkflowInstanceState | null> => {
  const managedWorkflowState = await withTimeout(getManagedWorkflowState(), timeoutMs);
  if (!managedWorkflowState) {
    return null;
  }
  const readState = (inSpaceId: string) =>
    withTimeout(managedWorkflowState.getInstalledWorkflowState(workflowId, inSpaceId), timeoutMs);

  return (
    (await readState(spaceId)) ??
    (spaceId === GLOBAL_WORKFLOW_SPACE_ID ? null : await readState(GLOBAL_WORKFLOW_SPACE_ID))
  );
};
