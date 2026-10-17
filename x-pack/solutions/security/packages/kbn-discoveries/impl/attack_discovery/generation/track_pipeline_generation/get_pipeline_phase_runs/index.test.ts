/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import {
  ExecutionStatus,
  type ChildWorkflowExecutionItem,
  type WorkflowExecutionDto,
} from '@kbn/workflows';

import type { PipelineWorkflowsApi } from '../types';
import { getPipelinePhaseRuns } from '.';

jest.mock('../../resolve_default_workflow_ids', () => ({
  resolveDefaultWorkflowIds: () => ({
    default_alert_retrieval: 'retrieval-workflow',
    generation: 'generation-workflow',
    validate: 'validation-workflow',
  }),
}));

const request = { headers: {} } as unknown as KibanaRequest;

const buildChild = (
  workflowId: string,
  executionId: string,
  status: ExecutionStatus = ExecutionStatus.COMPLETED
): ChildWorkflowExecutionItem =>
  ({
    executionId,
    status,
    workflowId,
    workflowName: `${workflowId} name`,
  } as unknown as ChildWorkflowExecutionItem);

const buildExecution = (id: string): WorkflowExecutionDto =>
  ({ id, status: 'completed' } as unknown as WorkflowExecutionDto);

const buildApi = ({
  children,
  executions,
}: {
  children: ChildWorkflowExecutionItem[];
  executions: Record<string, WorkflowExecutionDto | null>;
}) => {
  const getChildWorkflowExecutions = jest.fn().mockResolvedValue(children);
  const getWorkflowExecution = jest
    .fn()
    .mockImplementation(async (executionId: string) => executions[executionId] ?? null);

  return {
    api: {
      getChildWorkflowExecutions,
      getWorkflowExecution,
    } as unknown as PipelineWorkflowsApi,
    getChildWorkflowExecutions,
    getWorkflowExecution,
  };
};

const loadAll = () => true;

describe('getPipelinePhaseRuns', () => {
  const allChildren = [
    buildChild('retrieval-workflow', 'retrieval-run'),
    buildChild('generation-workflow', 'generation-run'),
    buildChild('validation-workflow', 'validation-run'),
  ];

  const allExecutions = {
    'generation-run': buildExecution('generation-run'),
    'retrieval-run': buildExecution('retrieval-run'),
    'validation-run': buildExecution('validation-run'),
  };

  const getRuns = (
    api: PipelineWorkflowsApi,
    loadPhase: Parameters<typeof getPipelinePhaseRuns>[0]['loadPhase'] = loadAll,
    spaceId = 'default'
  ) =>
    getPipelinePhaseRuns({
      loadPhase,
      pipelineRunId: 'pipeline-run',
      request,
      spaceId,
      workflowsManagementApi: api,
    });

  it('maps every default workflow child to its phase', async () => {
    const { api } = buildApi({ children: allChildren, executions: allExecutions });

    const runs = await getRuns(api);

    expect(runs).toEqual({
      alertRetrieval: {
        execution: allExecutions['retrieval-run'],
        status: ExecutionStatus.COMPLETED,
        tracking: {
          workflowId: 'retrieval-workflow',
          workflowName: 'retrieval-workflow name',
          workflowRunId: 'retrieval-run',
        },
      },
      generation: {
        execution: allExecutions['generation-run'],
        status: ExecutionStatus.COMPLETED,
        tracking: {
          workflowId: 'generation-workflow',
          workflowName: 'generation-workflow name',
          workflowRunId: 'generation-run',
        },
      },
      validation: {
        execution: allExecutions['validation-run'],
        status: ExecutionStatus.COMPLETED,
        tracking: {
          workflowId: 'validation-workflow',
          workflowName: 'validation-workflow name',
          workflowRunId: 'validation-run',
        },
      },
    });
  });

  it('reads the children of the pipeline run in its space', async () => {
    const { api, getChildWorkflowExecutions } = buildApi({
      children: allChildren,
      executions: allExecutions,
    });

    await getRuns(api, loadAll, 'my-space');

    expect(getChildWorkflowExecutions).toHaveBeenCalledWith('pipeline-run', 'my-space', request);
  });

  it('omits the phases whose child has not started', async () => {
    const { api } = buildApi({
      children: [buildChild('retrieval-workflow', 'retrieval-run')],
      executions: allExecutions,
    });

    const runs = await getRuns(api);

    expect(Object.keys(runs)).toEqual(['alertRetrieval']);
  });

  it('ignores children that are not default Attack Discovery workflows', async () => {
    const { api, getWorkflowExecution } = buildApi({
      children: [buildChild('some-other-workflow', 'other-run')],
      executions: { 'other-run': buildExecution('other-run') },
    });

    const runs = await getRuns(api);

    expect({ calls: getWorkflowExecution.mock.calls.length, runs }).toEqual({ calls: 0, runs: {} });
  });

  it('keeps the tracking, without an execution, of a phase whose execution cannot be loaded', async () => {
    const { api } = buildApi({
      children: allChildren,
      executions: { ...allExecutions, 'generation-run': null },
    });

    const runs = await getRuns(api);

    expect(runs.generation).toEqual({
      status: ExecutionStatus.COMPLETED,
      tracking: {
        workflowId: 'generation-workflow',
        workflowName: 'generation-workflow name',
        workflowRunId: 'generation-run',
      },
    });
  });

  it('loads only the executions of the phases loadPhase selects', async () => {
    const { api, getWorkflowExecution } = buildApi({
      children: allChildren,
      executions: allExecutions,
    });

    await getRuns(api, (phase) => phase === 'generation');

    expect(getWorkflowExecution.mock.calls.map(([executionId]) => executionId)).toEqual([
      'generation-run',
    ]);
  });

  it('keeps the tracking and status of the phases it does not load', async () => {
    const { api } = buildApi({ children: allChildren, executions: allExecutions });

    const runs = await getRuns(api, (phase) => phase === 'generation');

    expect(runs.alertRetrieval).toEqual({
      status: ExecutionStatus.COMPLETED,
      tracking: {
        workflowId: 'retrieval-workflow',
        workflowName: 'retrieval-workflow name',
        workflowRunId: 'retrieval-run',
      },
    });
  });

  it('passes each phase and the status of its child to loadPhase', async () => {
    const { api } = buildApi({
      children: [
        buildChild('retrieval-workflow', 'retrieval-run'),
        buildChild('generation-workflow', 'generation-run', ExecutionStatus.FAILED),
      ],
      executions: allExecutions,
    });
    const loadPhase = jest.fn(() => false);

    await getRuns(api, loadPhase);

    expect(loadPhase.mock.calls).toEqual([
      ['alertRetrieval', ExecutionStatus.COMPLETED],
      ['generation', ExecutionStatus.FAILED],
    ]);
  });

  it('loads each execution with its output, without its input', async () => {
    const { api, getWorkflowExecution } = buildApi({
      children: allChildren,
      executions: allExecutions,
    });

    await getRuns(api, loadAll, 'my-space');

    expect(getWorkflowExecution.mock.calls).toEqual([
      ['retrieval-run', 'my-space', { includeOutput: true, request }],
      ['generation-run', 'my-space', { includeOutput: true, request }],
      ['validation-run', 'my-space', { includeOutput: true, request }],
    ]);
  });
});
