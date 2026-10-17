/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AnalyticsServiceSetup,
  AuthenticatedUser,
  CoreStart,
  ElasticsearchClient,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import { ExecutionStatus, type WorkflowExecutionDto } from '@kbn/workflows';

import type {
  PipelineGenerationContext,
  PipelinePhaseRun,
  PipelinePhaseRuns,
  PipelineWorkflowsApi,
} from '../types';
import { recordPipelineFailure } from '.';

const mockClassifyFailedRun = jest.fn();
const mockGetPipelinePhaseRuns = jest.fn();
const mockRefreshEventLogIndex = jest.fn();
const mockReportWorkflowError = jest.fn();
const mockWriteAlertRetrievalFailedEvent = jest.fn();
const mockWriteGenerateStepFailedEvent = jest.fn();
const mockWriteGenerationFailedEvent = jest.fn();
const mockWriteValidationFailedEvent = jest.fn();

jest.mock('../../../../lib/telemetry/report_workflow_telemetry', () => ({
  reportWorkflowError: (...args: unknown[]) => mockReportWorkflowError(...args),
}));

jest.mock('../../execute_generation_workflow', () => ({
  writeGenerationFailedEvent: (...args: unknown[]) => mockWriteGenerationFailedEvent(...args),
}));

jest.mock('../../invoke_generation_workflow', () => ({
  writeGenerateStepFailedEvent: (...args: unknown[]) => mockWriteGenerateStepFailedEvent(...args),
}));

jest.mock('../../invoke_validation_workflow', () => ({
  writeValidationFailedEvent: (...args: unknown[]) => mockWriteValidationFailedEvent(...args),
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

jest.mock('../../write_alert_retrieval_failed_event', () => ({
  writeAlertRetrievalFailedEvent: (...args: unknown[]) =>
    mockWriteAlertRetrievalFailedEvent(...args),
}));

jest.mock('../classify_failed_run', () => ({
  classifyFailedRun: (...args: unknown[]) => mockClassifyFailedRun(...args),
}));

jest.mock('../get_pipeline_phase_runs', () => ({
  getPipelinePhaseRuns: (...args: unknown[]) => mockGetPipelinePhaseRuns(...args),
}));

const analytics = { reportEvent: jest.fn() } as unknown as AnalyticsServiceSetup;
const authenticatedUser = { username: 'elastic' } as unknown as AuthenticatedUser;
const coreStart = {} as unknown as CoreStart;
const esClient = {} as unknown as ElasticsearchClient;
const eventLogger = {} as unknown as IEventLogger;
const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as Logger;
const now = new Date('2026-10-16T11:10:00.000Z');
const pipelineStartedAt = new Date('2026-10-16T11:00:00.000Z');
const request = { headers: {} } as unknown as KibanaRequest;

const buildContext = (
  overrides: Partial<PipelineGenerationContext> = {}
): PipelineGenerationContext => ({
  analytics,
  apiConfig: {
    action_type_id: '.gen-ai',
    connector_id: 'connector-1',
    model: 'gpt-test',
    provider: 'OpenAI',
  },
  authenticatedUser,
  coreStart,
  esClient,
  eventLogIndex: '.kibana-event-log-test',
  eventLogger,
  executionUuid: 'execution-uuid',
  logger,
  pipelineRunId: 'pipeline-run',
  pipelineStartedAt,
  pipelineWorkflowId: 'pipeline-workflow',
  request,
  spaceId: 'default',
  workflowsManagementApi: {} as unknown as PipelineWorkflowsApi,
  ...overrides,
});

const buildRun = ({
  startedAt,
  status,
  workflowId,
  workflowRunId,
}: {
  startedAt: string;
  status: ExecutionStatus;
  workflowId: string;
  workflowRunId: string;
}): PipelinePhaseRun => ({
  execution: {
    finishedAt: '2026-10-16T11:09:00.000Z',
    id: workflowRunId,
    startedAt,
    status,
  } as unknown as WorkflowExecutionDto,
  status,
  tracking: { workflowId, workflowRunId },
});

const retrievalRun = (status: ExecutionStatus): PipelinePhaseRun =>
  buildRun({
    startedAt: '2026-10-16T11:01:00.000Z',
    status,
    workflowId: 'retrieval-workflow',
    workflowRunId: 'retrieval-run',
  });

const generationRun = (status: ExecutionStatus): PipelinePhaseRun =>
  buildRun({
    startedAt: '2026-10-16T11:03:00.000Z',
    status,
    workflowId: 'generation-workflow',
    workflowRunId: 'generation-run',
  });

const validationRun = (status: ExecutionStatus): PipelinePhaseRun =>
  buildRun({
    startedAt: '2026-10-16T11:06:00.000Z',
    status,
    workflowId: 'validation-workflow',
    workflowRunId: 'validation-run',
  });

const classification = {
  errorCategory: 'rate_limit',
  failedWorkflowId: 'failed-workflow',
  message: 'The model was rate limited',
};

const baseEvent = {
  authenticatedUser,
  connectorId: 'connector-1',
  eventLogger,
  eventLogIndex: '.kibana-event-log-test',
  executionUuid: 'execution-uuid',
  logger,
  spaceId: 'default',
};

const toWorkflowExecutions = (runs: PipelinePhaseRuns) => ({
  alertRetrieval: runs.alertRetrieval != null ? [runs.alertRetrieval.tracking] : null,
  gate: null,
  generation: runs.generation?.tracking ?? null,
  validation: runs.validation?.tracking ?? null,
});

describe('recordPipelineFailure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);

    mockClassifyFailedRun.mockReturnValue(classification);
    mockGetPipelinePhaseRuns.mockResolvedValue({});
    mockRefreshEventLogIndex.mockResolvedValue(undefined);
    mockWriteAlertRetrievalFailedEvent.mockResolvedValue(undefined);
    mockWriteGenerateStepFailedEvent.mockResolvedValue(undefined);
    mockWriteGenerationFailedEvent.mockResolvedValue(undefined);
    mockWriteValidationFailedEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads only the runs that did not complete', async () => {
    await recordPipelineFailure({ context: buildContext() });
    const [[{ loadPhase }]] = mockGetPipelinePhaseRuns.mock.calls;

    expect([
      loadPhase('alertRetrieval', ExecutionStatus.COMPLETED),
      loadPhase('generation', ExecutionStatus.FAILED),
      loadPhase('validation', ExecutionStatus.RUNNING),
    ]).toEqual([false, true, true]);
  });

  it('writes no phase event for a failed run that could not be loaded', async () => {
    const { status, tracking } = generationRun(ExecutionStatus.FAILED);
    mockGetPipelinePhaseRuns.mockResolvedValue({ generation: { status, tracking } });

    await recordPipelineFailure({ context: buildContext() });

    expect(mockWriteGenerateStepFailedEvent).not.toHaveBeenCalled();
  });

  describe('when the alert retrieval run failed', () => {
    const runs: PipelinePhaseRuns = { alertRetrieval: retrievalRun(ExecutionStatus.FAILED) };

    beforeEach(() => {
      mockGetPipelinePhaseRuns.mockResolvedValue(runs);
    });

    it('classifies the alert retrieval run', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockClassifyFailedRun).toHaveBeenCalledWith({
        apiConfig: buildContext().apiConfig,
        execution: runs.alertRetrieval?.execution,
        executionUuid: 'execution-uuid',
        logger,
        phase: 'alertRetrieval',
        workflowId: 'retrieval-workflow',
      });
    });

    it('writes alert-retrieval-failed with the classification', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockWriteAlertRetrievalFailedEvent).toHaveBeenCalledWith({
        ...baseEvent,
        endTime: now,
        errorCategory: 'rate_limit',
        errorMessage: 'The model was rate limited',
        failedWorkflowId: 'failed-workflow',
        startTime: new Date('2026-10-16T11:01:00.000Z'),
        workflowExecutions: toWorkflowExecutions(runs),
        workflowId: 'retrieval-workflow',
        workflowRunId: 'retrieval-run',
      });
    });

    it('writes no other phase event', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect([
        mockWriteGenerateStepFailedEvent.mock.calls.length,
        mockWriteValidationFailedEvent.mock.calls.length,
      ]).toEqual([0, 0]);
    });

    it('reports the retrieval step as the failed step', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockReportWorkflowError).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ failed_step: 'retrieval' }),
        })
      );
    });
  });

  describe('when the generation run failed', () => {
    const runs: PipelinePhaseRuns = {
      alertRetrieval: retrievalRun(ExecutionStatus.COMPLETED),
      generation: generationRun(ExecutionStatus.FAILED),
    };

    beforeEach(() => {
      mockGetPipelinePhaseRuns.mockResolvedValue(runs);
    });

    it('picks the first phase that did not complete', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockClassifyFailedRun).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'generation', workflowId: 'generation-workflow' })
      );
    });

    it('writes generate-step-failed with no alerts in context', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockWriteGenerateStepFailedEvent).toHaveBeenCalledWith({
        ...baseEvent,
        alertsContextCount: 0,
        endTime: now,
        errorMessage: 'The model was rate limited',
        startTime: new Date('2026-10-16T11:03:00.000Z'),
        workflowExecutions: toWorkflowExecutions(runs),
        workflowId: 'generation-workflow',
        workflowRunId: 'generation-run',
      });
    });

    it('writes no alert retrieval or validation failed event', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect([
        mockWriteAlertRetrievalFailedEvent.mock.calls.length,
        mockWriteValidationFailedEvent.mock.calls.length,
      ]).toEqual([0, 0]);
    });

    it('reports the generation step as the failed step', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockReportWorkflowError).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ failed_step: 'generation' }),
        })
      );
    });
  });

  describe('when the validation run did not complete', () => {
    const runs: PipelinePhaseRuns = {
      alertRetrieval: retrievalRun(ExecutionStatus.COMPLETED),
      generation: generationRun(ExecutionStatus.COMPLETED),
      validation: validationRun(ExecutionStatus.TIMED_OUT),
    };

    beforeEach(() => {
      mockGetPipelinePhaseRuns.mockResolvedValue(runs);
    });

    it('writes validation-failed', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockWriteValidationFailedEvent).toHaveBeenCalledWith({
        ...baseEvent,
        endTime: now,
        errorMessage: 'The model was rate limited',
        startTime: new Date('2026-10-16T11:06:00.000Z'),
        workflowExecutions: toWorkflowExecutions(runs),
        workflowId: 'validation-workflow',
        workflowRunId: 'validation-run',
      });
    });

    it('reports the validation step as the failed step', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockReportWorkflowError).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ failed_step: 'validation' }),
        })
      );
    });
  });

  it('writes generation-failed with the classification of the failed run', async () => {
    const runs: PipelinePhaseRuns = { alertRetrieval: retrievalRun(ExecutionStatus.FAILED) };
    mockGetPipelinePhaseRuns.mockResolvedValue(runs);

    await recordPipelineFailure({ context: buildContext(), errorMessage: 'ignored' });

    expect(mockWriteGenerationFailedEvent).toHaveBeenCalledWith({
      authenticatedUser,
      connectorId: 'connector-1',
      endTime: now,
      errorCategory: 'rate_limit',
      errorMessage: 'The model was rate limited',
      eventLogger,
      eventLogIndex: '.kibana-event-log-test',
      executionUuid: 'execution-uuid',
      failedWorkflowId: 'failed-workflow',
      logger,
      spaceId: 'default',
      startTime: pipelineStartedAt,
      workflowId: 'generation-workflow',
    });
  });

  it('writes the phase event before generation-failed, then refreshes the event log', async () => {
    mockGetPipelinePhaseRuns.mockResolvedValue({
      alertRetrieval: retrievalRun(ExecutionStatus.FAILED),
    });

    await recordPipelineFailure({ context: buildContext() });

    const [phaseFailed] = mockWriteAlertRetrievalFailedEvent.mock.invocationCallOrder;
    const [generationFailed] = mockWriteGenerationFailedEvent.mock.invocationCallOrder;
    const [refreshed] = mockRefreshEventLogIndex.mock.invocationCallOrder;

    expect([phaseFailed < generationFailed, generationFailed < refreshed]).toEqual([true, true]);
  });

  it('refreshes the event log index with the request of the run', async () => {
    await recordPipelineFailure({ context: buildContext() });

    expect(mockRefreshEventLogIndex).toHaveBeenCalledWith({
      coreStart,
      esClient,
      eventLogIndex: '.kibana-event-log-test',
      logger,
      request,
    });
  });

  it('reports attack_discovery_error telemetry with the workflow trigger', async () => {
    mockGetPipelinePhaseRuns.mockResolvedValue({
      alertRetrieval: retrievalRun(ExecutionStatus.FAILED),
    });

    await recordPipelineFailure({ context: buildContext() });

    expect(mockReportWorkflowError).toHaveBeenCalledWith({
      analytics,
      logger,
      params: {
        actionTypeId: '.gen-ai',
        errorMessage: 'The model was rate limited',
        execution_mode: 'workflow',
        failed_step: 'retrieval',
        misconfiguration_detected: false,
        model: 'gpt-test',
        provider: 'OpenAI',
        trigger: 'workflow',
      },
    });
  });

  it('does not report telemetry when analytics is not available', async () => {
    await recordPipelineFailure({ context: buildContext({ analytics: undefined }) });

    expect(mockReportWorkflowError).not.toHaveBeenCalled();
  });

  describe('when no child run failed', () => {
    const runs: PipelinePhaseRuns = {
      alertRetrieval: retrievalRun(ExecutionStatus.COMPLETED),
      generation: generationRun(ExecutionStatus.COMPLETED),
    };

    beforeEach(() => {
      mockGetPipelinePhaseRuns.mockResolvedValue(runs);
    });

    it('does not classify a run', async () => {
      await recordPipelineFailure({ context: buildContext(), errorMessage: 'pipeline failed' });

      expect(mockClassifyFailedRun).not.toHaveBeenCalled();
    });

    it('writes no phase failed event', async () => {
      await recordPipelineFailure({ context: buildContext(), errorMessage: 'pipeline failed' });

      expect([
        mockWriteAlertRetrievalFailedEvent.mock.calls.length,
        mockWriteGenerateStepFailedEvent.mock.calls.length,
        mockWriteValidationFailedEvent.mock.calls.length,
      ]).toEqual([0, 0, 0]);
    });

    it('writes generation-failed with the error message of the pipeline', async () => {
      await recordPipelineFailure({ context: buildContext(), errorMessage: 'pipeline failed' });

      expect(mockWriteGenerationFailedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCategory: undefined,
          errorMessage: 'pipeline failed',
          failedWorkflowId: undefined,
        })
      );
    });

    it('writes generation-failed with a default message when there is no error message', async () => {
      await recordPipelineFailure({ context: buildContext() });

      expect(mockWriteGenerationFailedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: 'The Attack Discovery pipeline workflow failed',
        })
      );
    });

    it('writes generation-failed with a default message when the error message is blank', async () => {
      await recordPipelineFailure({ context: buildContext(), errorMessage: ' ' });

      expect(mockWriteGenerationFailedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: 'The Attack Discovery pipeline workflow failed',
        })
      );
    });

    it('reports no failed step', async () => {
      await recordPipelineFailure({ context: buildContext(), errorMessage: 'pipeline failed' });

      expect(mockReportWorkflowError).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            errorMessage: 'pipeline failed',
            failed_step: undefined,
          }),
        })
      );
    });
  });

  describe('when the child runs cannot be read', () => {
    beforeEach(() => {
      mockGetPipelinePhaseRuns.mockRejectedValue(new Error('workflows unavailable'));
    });

    it('does not throw', async () => {
      await expect(
        recordPipelineFailure({ context: buildContext(), errorMessage: 'pipeline failed' })
      ).resolves.toBeUndefined();
    });

    it('logs the read failure at debug level', async () => {
      await recordPipelineFailure({ context: buildContext(), errorMessage: 'pipeline failed' });

      const [[message]] = (logger.debug as jest.Mock).mock.calls;

      expect(message()).toBe(
        'Failed to read the child runs of pipeline generation execution-uuid: workflows unavailable'
      );
    });

    it('still writes generation-failed with the error message of the pipeline', async () => {
      await recordPipelineFailure({ context: buildContext(), errorMessage: 'pipeline failed' });

      expect(mockWriteGenerationFailedEvent).toHaveBeenCalledWith(
        expect.objectContaining({ errorMessage: 'pipeline failed' })
      );
    });

    it('still refreshes the event log index', async () => {
      await recordPipelineFailure({ context: buildContext(), errorMessage: 'pipeline failed' });

      expect(mockRefreshEventLogIndex).toHaveBeenCalled();
    });
  });
});
