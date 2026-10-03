/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';
import type { ManagedWorkflowStateApi } from '@kbn/workflows/server/types';
import type { ReportWorkerOutcomeSkipReason } from './skip_reasons';
import { withTimeout } from './with_timeout';

export interface CheckWorkflowManagedParams {
  getManagedWorkflowState: () => Promise<ManagedWorkflowStateApi | undefined>;
  hopTimeoutMs: number;
  spaceId: string;
  workflowId: string;
}

/**
 * Checks, through AlertZero's owner-bound managed workflows client, that the reporting workflow
 * is one AlertZero installed: in the execution space, else in the global space its shared
 * Workers live in. Returns the skip reason when it is not, or cannot be verified.
 */
export const checkWorkflowManaged = async ({
  getManagedWorkflowState,
  hopTimeoutMs,
  spaceId,
  workflowId,
}: CheckWorkflowManagedParams): Promise<ReportWorkerOutcomeSkipReason | undefined> => {
  try {
    const managedWorkflowState = await withTimeout(getManagedWorkflowState(), hopTimeoutMs);
    if (!managedWorkflowState) {
      return 'lineage_unavailable';
    }
    const readState = (inSpaceId: string) =>
      withTimeout(
        managedWorkflowState.getInstalledWorkflowState(workflowId, inSpaceId),
        hopTimeoutMs
      );

    const installed =
      (await readState(spaceId)) ??
      (spaceId === GLOBAL_WORKFLOW_SPACE_ID ? null : await readState(GLOBAL_WORKFLOW_SPACE_ID));
    return installed ? undefined : 'not_managed';
  } catch {
    return 'lineage_unavailable';
  }
};
