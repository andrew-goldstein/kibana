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
import { ExecutionStatus, type WorkflowExecutionDto } from '@kbn/workflows';

import type { PipelineGenerationContext, PipelinePhaseRun, PipelineWorkflowsApi } from '../types';
import { recordPipelineGeneration } from '.';

const mockExtractGenerationWorkflowResult = jest.fn();
const mockGetPipelinePhaseRuns = jest.fn();
const mockWriteGenerateStepStartedEvent = jest.fn();
const mockWriteGenerateStepSucceededEvent = jest.fn();
const mockWriteGenerationSucceededEvent = jest.fn();

jest.mock('../../invoke_generation_workflow', () => ({
  extractGenerationWorkflowResult: (...args: unknown[]) =>
    mockExtractGenerationWorkflowResult(...args),
  writeGenerateStepStartedEvent: (...args: unknown[]) => mockWriteGenerateStepStartedEvent(...args),
  writeGenerateStepSucceededEvent: (...args: unknown[]) =>
    mockWriteGenerateStepSucceededEvent(...args),
  writeGenerationSucceededEvent: (...args: unknown[]) => mockWriteGenerationSucceededEvent(...args),
}));

jest.mock('../get_pipeline_phase_runs', () => ({
  getPipelinePhaseRuns: (...args: unknown[]) => mockGetPipelinePhaseRuns(...args),
}));

const authenticatedUser = { username: 'elastic' } as unknown as AuthenticatedUser;
const eventLogger = {} as unknown as IEventLogger;
const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as Logger;

const context: PipelineGenerationContext = {
  apiConfig: { action_type_id: '.gen-ai', connector_id: 'connector-1' },
  authenticatedUser,
  coreStart: {} as unknown as CoreStart,
  esClient: {} as unknown as ElasticsearchClient,
  eventLogIndex: '.kibana-event-log-test',
  eventLogger,
  executionUuid: 'execution-uuid',
  logger,
  pipelineRunId: 'pipeline-run',
  pipelineStartedAt: new Date('2026-10-16T11:00:00.000Z'),
  pipelineWorkflowId: 'pipeline-workflow',
  request: { headers: {} } as unknown as KibanaRequest,
  spaceId: 'default',
  workflowsManagementApi: {} as unknown as PipelineWorkflowsApi,
};

const buildRun = ({
  finishedAt,
  startedAt,
  workflowId,
  workflowRunId,
}: {
  finishedAt: string;
  startedAt: string;
  workflowId: string;
  workflowRunId: string;
}): PipelinePhaseRun => ({
  execution: {
    finishedAt,
    id: workflowRunId,
    startedAt,
    status: 'completed',
  } as unknown as WorkflowExecutionDto,
  status: ExecutionStatus.COMPLETED,
  tracking: { workflowId, workflowRunId },
});

const alertRetrieval = buildRun({
  finishedAt: '2026-10-16T11:02:00.000Z',
  startedAt: '2026-10-16T11:01:00.000Z',
  workflowId: 'retrieval-workflow',
  workflowRunId: 'retrieval-run',
});

const generation = buildRun({
  finishedAt: '2026-10-16T11:05:00.000Z',
  startedAt: '2026-10-16T11:03:00.000Z',
  workflowId: 'generation-workflow',
  workflowRunId: 'generation-run',
});

const expectedEvent = {
  alertsContextCount: 12,
  authenticatedUser,
  connectorId: 'connector-1',
  eventLogger,
  eventLogIndex: '.kibana-event-log-test',
  executionUuid: 'execution-uuid',
  logger,
  spaceId: 'default',
  startTime: new Date('2026-10-16T11:03:00.000Z'),
  workflowExecutions: {
    alertRetrieval: [alertRetrieval.tracking],
    gate: null,
    generation: generation.tracking,
    validation: null,
  },
  workflowId: 'generation-workflow',
  workflowRunId: 'generation-run',
};

const endTime = new Date('2026-10-16T11:05:00.000Z');

const selectedPhases = (loadPhase: (phase: string, status: ExecutionStatus) => boolean) =>
  ['alertRetrieval', 'generation', 'validation'].filter((phase) =>
    loadPhase(phase, ExecutionStatus.COMPLETED)
  );

describe('recordPipelineGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockExtractGenerationWorkflowResult.mockReturnValue({
      alertsContextCount: 12,
      attackDiscoveries: [],
    });
    mockGetPipelinePhaseRuns.mockResolvedValue({ alertRetrieval, generation });
    mockWriteGenerateStepStartedEvent.mockResolvedValue(undefined);
    mockWriteGenerateStepSucceededEvent.mockResolvedValue(undefined);
    mockWriteGenerationSucceededEvent.mockResolvedValue(undefined);
  });

  it('reads the phase runs of the pipeline with its context', async () => {
    await recordPipelineGeneration(context);

    expect(mockGetPipelinePhaseRuns).toHaveBeenCalledWith({
      ...context,
      loadPhase: expect.any(Function),
    });
  });

  it('loads only the generation run', async () => {
    await recordPipelineGeneration(context);
    const [[{ loadPhase }]] = mockGetPipelinePhaseRuns.mock.calls;

    expect(selectedPhases(loadPhase)).toEqual(['generation']);
  });

  it('writes nothing when the generation run could not be loaded', async () => {
    mockGetPipelinePhaseRuns.mockResolvedValue({
      generation: { status: generation.status, tracking: generation.tracking },
    });

    await recordPipelineGeneration(context);

    expect(mockWriteGenerateStepStartedEvent).not.toHaveBeenCalled();
  });

  it('extracts the generation result from the generation run', async () => {
    await recordPipelineGeneration(context);

    expect(mockExtractGenerationWorkflowResult).toHaveBeenCalledWith({
      execution: generation.execution,
      executionUuid: 'execution-uuid',
    });
  });

  it('writes generate-step-started with the generation run reference', async () => {
    await recordPipelineGeneration(context);

    expect(mockWriteGenerateStepStartedEvent).toHaveBeenCalledWith(expectedEvent);
  });

  it('writes generate-step-succeeded with the end time of the run', async () => {
    await recordPipelineGeneration(context);

    expect(mockWriteGenerateStepSucceededEvent).toHaveBeenCalledWith({
      ...expectedEvent,
      endTime,
    });
  });

  it('writes generation-succeeded with the end time of the run', async () => {
    await recordPipelineGeneration(context);

    expect(mockWriteGenerationSucceededEvent).toHaveBeenCalledWith({ ...expectedEvent, endTime });
  });

  it('writes generate-step-started, generate-step-succeeded, then generation-succeeded', async () => {
    await recordPipelineGeneration(context);

    const [started] = mockWriteGenerateStepStartedEvent.mock.invocationCallOrder;
    const [stepSucceeded] = mockWriteGenerateStepSucceededEvent.mock.invocationCallOrder;
    const [generationSucceeded] = mockWriteGenerationSucceededEvent.mock.invocationCallOrder;

    expect([started < stepSucceeded, stepSucceeded < generationSucceeded]).toEqual([true, true]);
  });

  describe('when there is no generation run', () => {
    beforeEach(() => {
      mockGetPipelinePhaseRuns.mockResolvedValue({ alertRetrieval });
    });

    it('logs a warning', async () => {
      await recordPipelineGeneration(context);

      expect(logger.warn).toHaveBeenCalledWith(
        'No generation run found for pipeline generation execution-uuid'
      );
    });

    it('writes nothing', async () => {
      await recordPipelineGeneration(context);

      expect([
        mockWriteGenerateStepStartedEvent.mock.calls.length,
        mockWriteGenerateStepSucceededEvent.mock.calls.length,
        mockWriteGenerationSucceededEvent.mock.calls.length,
      ]).toEqual([0, 0, 0]);
    });
  });
});
