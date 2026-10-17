/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AuthenticatedUser,
  CoreStart,
  ElasticsearchClient,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import { ExecutionStatus } from '@kbn/workflows';

import type { ReconcileWorkflowsApi } from '../types';
import { reconcilePipelineGenerations, STRANDED_GENERATION_MESSAGE } from '.';

const mockRefreshEventLogIndex = jest.fn();
const mockWriteGenerationFailedEvent = jest.fn();

jest.mock('../../execute_generation_workflow', () => ({
  writeGenerationFailedEvent: (...args: unknown[]) => mockWriteGenerationFailedEvent(...args),
}));

jest.mock('../../refresh_event_log_index', () => ({
  refreshEventLogIndex: (...args: unknown[]) => mockRefreshEventLogIndex(...args),
}));

jest.mock('../../resolve_default_workflow_ids', () => ({
  resolveDefaultWorkflowIds: () => ({
    default_alert_retrieval: 'retrieval-workflow',
    generation: 'generation-workflow',
    validate: 'validation-workflow',
  }),
}));

const PIPELINE_WORKFLOW_ID = 'batch-pipeline';
const authenticatedUser = { username: 'kibana/alertzero_attack_discovery' } as AuthenticatedUser;
const coreStart = {} as unknown as CoreStart;
const esClient = {} as unknown as ElasticsearchClient;
const eventLogger = {} as unknown as IEventLogger;
const logger = { debug: jest.fn(), warn: jest.fn() } as unknown as Logger;
const request = { headers: {} } as unknown as KibanaRequest;

const strandedChild = {
  executionId: 'pipeline-run-1',
  parentStepExecutionId: 'parent-step-1',
  status: ExecutionStatus.CANCELLED,
  stepExecutions: [{ status: ExecutionStatus.COMPLETED, stepId: 'start_generation' }],
  workflowId: PIPELINE_WORKFLOW_ID,
  workflowName: 'Batch pipeline',
};

const completedChild = {
  ...strandedChild,
  executionId: 'pipeline-run-2',
  status: ExecutionStatus.COMPLETED,
};

const strandedExecution = {
  finishedAt: '2026-10-16T11:30:00.000Z',
  id: 'pipeline-run-1',
  startedAt: '2026-10-16T11:00:00.000Z',
  status: ExecutionStatus.CANCELLED,
  stepExecutions: [
    {
      output: {
        api_config: { action_type_id: '.gen-ai', connector_id: 'connector-1' },
        execution_uuid: 'generation-1',
      },
      stepId: 'start_generation',
      stepType: 'security.attack-discovery.trackGeneration',
    },
  ],
};

const buildApi = ({
  children = [strandedChild, completedChild],
  execution = strandedExecution,
}: {
  children?: unknown[];
  execution?: unknown;
} = {}) =>
  ({
    getChildWorkflowExecutions: jest.fn().mockResolvedValue(children),
    getWorkflowExecution: jest.fn().mockResolvedValue(execution),
    getWorkflowExecutions: jest.fn(),
  } as unknown as ReconcileWorkflowsApi);

const reconcile = (workflowsManagementApi: ReconcileWorkflowsApi) =>
  reconcilePipelineGenerations({
    authenticatedUser,
    coreStart,
    esClient,
    eventLogIndex: '.kibana-event-log-test',
    eventLogger,
    logger,
    parentExecutionId: 'batched-generation-run',
    pipelineWorkflowId: PIPELINE_WORKFLOW_ID,
    request,
    spaceId: 'default',
    workflowsManagementApi,
  });

describe('reconcilePipelineGenerations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the child runs of the parent run', async () => {
    const workflowsManagementApi = buildApi();

    await reconcile(workflowsManagementApi);

    expect(workflowsManagementApi.getChildWorkflowExecutions).toHaveBeenCalledWith(
      'batched-generation-run',
      'default',
      request
    );
  });

  it('loads only the stranded runs, with their step outputs', async () => {
    const workflowsManagementApi = buildApi();

    await reconcile(workflowsManagementApi);

    expect(workflowsManagementApi.getWorkflowExecution).toHaveBeenCalledTimes(1);
  });

  it('loads the stranded run with its step outputs', async () => {
    const workflowsManagementApi = buildApi();

    await reconcile(workflowsManagementApi);

    expect(workflowsManagementApi.getWorkflowExecution).toHaveBeenCalledWith(
      'pipeline-run-1',
      'default',
      { includeOutput: true, request }
    );
  });

  it('writes generation-failed for the stranded generation', async () => {
    await reconcile(buildApi());

    expect(mockWriteGenerationFailedEvent).toHaveBeenCalledWith({
      authenticatedUser,
      connectorId: 'connector-1',
      endTime: new Date('2026-10-16T11:30:00.000Z'),
      errorMessage: STRANDED_GENERATION_MESSAGE,
      eventLogIndex: '.kibana-event-log-test',
      eventLogger,
      executionUuid: 'generation-1',
      logger,
      spaceId: 'default',
      startTime: new Date('2026-10-16T11:00:00.000Z'),
      workflowId: 'generation-workflow',
    });
  });

  it('refreshes the event log index after writing', async () => {
    await reconcile(buildApi());

    expect(mockRefreshEventLogIndex).toHaveBeenCalledWith({
      coreStart,
      esClient,
      eventLogIndex: '.kibana-event-log-test',
      logger,
      request,
    });
  });

  it('returns the number of generations it marked failed', async () => {
    const result = await reconcile(buildApi());

    expect(result).toBe(1);
  });

  it('reads the generation from the start step behind its on-failure wrapper', async () => {
    const execution = {
      ...strandedExecution,
      stepExecutions: [
        { output: null, stepId: 'start_generation', stepType: 'fallback' },
        ...strandedExecution.stepExecutions,
      ],
    };

    await reconcile(buildApi({ execution }));

    expect(mockWriteGenerationFailedEvent).toHaveBeenCalledWith(
      expect.objectContaining({ connectorId: 'connector-1', executionUuid: 'generation-1' })
    );
  });

  it('skips a stranded run whose start step recorded no generation', async () => {
    await reconcile(buildApi({ execution: { ...strandedExecution, stepExecutions: [] } }));

    expect(mockWriteGenerationFailedEvent).not.toHaveBeenCalled();
  });

  it('skips a stranded run that can no longer be read', async () => {
    await reconcile(buildApi({ execution: null }));

    expect(mockWriteGenerationFailedEvent).not.toHaveBeenCalled();
  });

  it('does not refresh the event log index when nothing was stranded', async () => {
    await reconcile(buildApi({ children: [completedChild] }));

    expect(mockRefreshEventLogIndex).not.toHaveBeenCalled();
  });
});
