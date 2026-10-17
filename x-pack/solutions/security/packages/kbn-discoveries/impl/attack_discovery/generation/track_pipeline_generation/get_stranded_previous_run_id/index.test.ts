/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { ExecutionStatus } from '@kbn/workflows';

import type { ReconcileWorkflowsApi } from '../types';
import { getStrandedPreviousRunId } from '.';

const request = { headers: {} } as unknown as KibanaRequest;
const WORKLOAD_ID = 'system-security-floor-attack-discovery-default';

const inheritedFrom = (workloadId: string) => ({
  effectiveIdentity: {
    id: 'kibana/alertzero_attack_discovery',
    inheritedFrom: { workloadId },
    type: 'service_account',
  },
});

const buildApi = (results: Array<{ id: string; status: ExecutionStatus }>) =>
  ({
    getWorkflowExecutions: jest.fn().mockResolvedValue({
      page: 1,
      results: results.map((result) => ({ ...inheritedFrom(WORKLOAD_ID), ...result })),
      size: 10,
      total: 2,
    }),
  } as unknown as ReconcileWorkflowsApi);

describe('getStrandedPreviousRunId', () => {
  it('asks for the newest runs of the workflow first', async () => {
    const workflowsManagementApi = buildApi([]);

    await getStrandedPreviousRunId({
      currentRunId: 'run-2',
      request,
      spaceId: 'default',
      workflowId: 'batched-generation',
      workflowsManagementApi,
      workloadId: WORKLOAD_ID,
    });

    expect(workflowsManagementApi.getWorkflowExecutions).toHaveBeenCalledWith(
      {
        omitStepRuns: true,
        request,
        size: 10,
        sortField: 'createdAt',
        sortOrder: 'desc',
        workflowId: 'batched-generation',
      },
      'default'
    );
  });

  it.each([ExecutionStatus.CANCELLED, ExecutionStatus.TIMED_OUT, ExecutionStatus.RUNNING])(
    'returns the run before the current one when it is %s',
    async (status) => {
      const workflowsManagementApi = buildApi([
        { id: 'run-2', status: ExecutionStatus.RUNNING },
        { id: 'run-1', status },
      ]);

      const result = await getStrandedPreviousRunId({
        currentRunId: 'run-2',
        request,
        spaceId: 'default',
        workflowId: 'batched-generation',
        workflowsManagementApi,
        workloadId: WORKLOAD_ID,
      });

      expect(result).toBe('run-1');
    }
  );

  it.each([ExecutionStatus.COMPLETED, ExecutionStatus.FAILED])(
    'returns undefined when the previous run is %s, because it reconciled its own batches',
    async (status) => {
      const workflowsManagementApi = buildApi([
        { id: 'run-2', status: ExecutionStatus.RUNNING },
        { id: 'run-1', status },
      ]);

      const result = await getStrandedPreviousRunId({
        currentRunId: 'run-2',
        request,
        spaceId: 'default',
        workflowId: 'batched-generation',
        workflowsManagementApi,
        workloadId: WORKLOAD_ID,
      });

      expect(result).toBeUndefined();
    }
  );

  it('returns undefined when there is no previous run', async () => {
    const workflowsManagementApi = buildApi([{ id: 'run-1', status: ExecutionStatus.RUNNING }]);

    const result = await getStrandedPreviousRunId({
      currentRunId: 'run-1',
      request,
      spaceId: 'default',
      workflowId: 'batched-generation',
      workflowsManagementApi,
      workloadId: WORKLOAD_ID,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined when the current run is not among the newest runs', async () => {
    const workflowsManagementApi = buildApi([
      { id: 'run-9', status: ExecutionStatus.RUNNING },
      { id: 'run-8', status: ExecutionStatus.CANCELLED },
    ]);

    const result = await getStrandedPreviousRunId({
      currentRunId: 'run-1',
      request,
      spaceId: 'default',
      workflowId: 'batched-generation',
      workflowsManagementApi,
      workloadId: WORKLOAD_ID,
    });

    expect(result).toBeUndefined();
  });

  it.each([
    ['another workload', inheritedFrom('system-security-floor-alert-triage-default')],
    ['no inherited identity', { effectiveIdentity: undefined }],
  ])('returns undefined when the previous run ran with %s', async (_, identity) => {
    const workflowsManagementApi = {
      getWorkflowExecutions: jest.fn().mockResolvedValue({
        page: 1,
        results: [
          { ...inheritedFrom(WORKLOAD_ID), id: 'run-2', status: ExecutionStatus.RUNNING },
          { ...identity, id: 'run-1', status: ExecutionStatus.CANCELLED },
        ],
        size: 10,
        total: 2,
      }),
    } as unknown as ReconcileWorkflowsApi;

    const result = await getStrandedPreviousRunId({
      currentRunId: 'run-2',
      request,
      spaceId: 'default',
      workflowId: 'batched-generation',
      workflowsManagementApi,
      workloadId: WORKLOAD_ID,
    });

    expect(result).toBeUndefined();
  });
});
