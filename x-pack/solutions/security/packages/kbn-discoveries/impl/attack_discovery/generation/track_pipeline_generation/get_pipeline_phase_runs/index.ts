/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { ExecutionStatus } from '@kbn/workflows';

import { resolveDefaultWorkflowIds } from '../../resolve_default_workflow_ids';
import type { PipelinePhaseRun, PipelinePhaseRuns, PipelineWorkflowsApi } from '../types';

/**
 * Reads the default Attack Discovery workflows a pipeline run started as children, keyed by
 * phase. A phase whose workflow hasn't started yet is absent. Only the phases `loadPhase`
 * selects have their execution, with its output, loaded.
 */
export const getPipelinePhaseRuns = async ({
  loadPhase,
  pipelineRunId,
  request,
  spaceId,
  workflowsManagementApi,
}: {
  loadPhase: (phase: keyof PipelinePhaseRuns, status: ExecutionStatus) => boolean;
  pipelineRunId: string;
  request: KibanaRequest;
  spaceId: string;
  workflowsManagementApi: PipelineWorkflowsApi;
}): Promise<PipelinePhaseRuns> => {
  const children = await workflowsManagementApi.getChildWorkflowExecutions(
    pipelineRunId,
    spaceId,
    request
  );
  const workflowIds = resolveDefaultWorkflowIds();

  const loadPhaseRun = async (
    phase: keyof PipelinePhaseRuns,
    workflowId: string
  ): Promise<PipelinePhaseRun | undefined> => {
    const child = children.find((item) => item.workflowId === workflowId);

    if (child == null) {
      return undefined;
    }

    const execution = loadPhase(phase, child.status)
      ? await workflowsManagementApi.getWorkflowExecution(child.executionId, spaceId, {
          includeOutput: true,
          request,
        })
      : null;

    return {
      ...(execution != null ? { execution } : {}),
      status: child.status,
      tracking: {
        workflowId: child.workflowId,
        workflowName: child.workflowName,
        workflowRunId: child.executionId,
      },
    };
  };

  const [alertRetrieval, generation, validation] = await Promise.all([
    loadPhaseRun('alertRetrieval', workflowIds.default_alert_retrieval),
    loadPhaseRun('generation', workflowIds.generation),
    loadPhaseRun('validation', workflowIds.validate),
  ]);

  return {
    ...(alertRetrieval != null ? { alertRetrieval } : {}),
    ...(generation != null ? { generation } : {}),
    ...(validation != null ? { validation } : {}),
  };
};
