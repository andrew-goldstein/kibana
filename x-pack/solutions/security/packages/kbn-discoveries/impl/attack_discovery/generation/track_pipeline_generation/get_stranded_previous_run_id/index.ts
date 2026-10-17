/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { ExecutionStatus } from '@kbn/workflows';

import type { ReconcileWorkflowsApi } from '../types';

/** A run that ended, or was left running, before it could reconcile its own batches. */
const STRANDED_STATUSES: readonly ExecutionStatus[] = [
  ExecutionStatus.CANCELLED,
  ExecutionStatus.RUNNING,
  ExecutionStatus.TIMED_OUT,
];

const RECENT_RUNS_SIZE = 10;

/**
 * Returns the id of the workflow's run just before the current one when that run inherited the
 * same workload's service account and was cancelled, timed out, or left running, so the current
 * run can reconcile its batches.
 */
export const getStrandedPreviousRunId = async ({
  currentRunId,
  request,
  spaceId,
  workflowId,
  workflowsManagementApi,
  workloadId,
}: {
  currentRunId: string;
  request: KibanaRequest;
  spaceId: string;
  workflowId: string;
  workflowsManagementApi: ReconcileWorkflowsApi;
  workloadId: string;
}): Promise<string | undefined> => {
  const { results } = await workflowsManagementApi.getWorkflowExecutions(
    {
      omitStepRuns: true,
      request,
      size: RECENT_RUNS_SIZE,
      sortField: 'createdAt',
      sortOrder: 'desc',
      workflowId,
    },
    spaceId
  );

  const currentIndex = results.findIndex(({ id }) => id === currentRunId);
  const previous = currentIndex === -1 ? undefined : results[currentIndex + 1];

  return previous != null &&
    STRANDED_STATUSES.includes(previous.status) &&
    previous.effectiveIdentity?.inheritedFrom?.workloadId === workloadId
    ? previous.id
    : undefined;
};
