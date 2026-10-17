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
import { recordPipelineRetrieval } from '.';

const mockExtractAlertRetrievalResult = jest.fn();
const mockGetPipelinePhaseRuns = jest.fn();
const mockWriteAlertRetrievalStartedEvent = jest.fn();
const mockWriteAlertRetrievalSucceededEvent = jest.fn();

jest.mock('../../extract_alert_retrieval_result', () => ({
  extractAlertRetrievalResult: (...args: unknown[]) => mockExtractAlertRetrievalResult(...args),
}));

jest.mock('../../write_alert_retrieval_started_event', () => ({
  writeAlertRetrievalStartedEvent: (...args: unknown[]) =>
    mockWriteAlertRetrievalStartedEvent(...args),
}));

jest.mock('../../write_alert_retrieval_succeeded_event', () => ({
  writeAlertRetrievalSucceededEvent: (...args: unknown[]) =>
    mockWriteAlertRetrievalSucceededEvent(...args),
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

const alertRetrieval: PipelinePhaseRun = {
  execution: {
    finishedAt: '2026-10-16T11:02:00.000Z',
    id: 'retrieval-run',
    startedAt: '2026-10-16T11:01:00.000Z',
    status: 'completed',
  } as unknown as WorkflowExecutionDto,
  status: ExecutionStatus.COMPLETED,
  tracking: {
    workflowId: 'retrieval-workflow',
    workflowName: 'Alert retrieval',
    workflowRunId: 'retrieval-run',
  },
};

const expectedEvent = {
  authenticatedUser,
  connectorId: 'connector-1',
  eventLogger,
  eventLogIndex: '.kibana-event-log-test',
  executionUuid: 'execution-uuid',
  logger,
  spaceId: 'default',
  startTime: new Date('2026-10-16T11:01:00.000Z'),
  workflowExecutions: {
    alertRetrieval: [alertRetrieval.tracking],
    gate: null,
    generation: null,
    validation: null,
  },
  workflowId: 'retrieval-workflow',
  workflowRunId: 'retrieval-run',
};

const selectedPhases = (loadPhase: (phase: string, status: ExecutionStatus) => boolean) =>
  ['alertRetrieval', 'generation', 'validation'].filter((phase) =>
    loadPhase(phase, ExecutionStatus.COMPLETED)
  );

describe('recordPipelineRetrieval', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockExtractAlertRetrievalResult.mockReturnValue({ alertsContextCount: 7 });
    mockGetPipelinePhaseRuns.mockResolvedValue({ alertRetrieval });
    mockWriteAlertRetrievalStartedEvent.mockResolvedValue(undefined);
    mockWriteAlertRetrievalSucceededEvent.mockResolvedValue(undefined);
  });

  it('reads the phase runs of the pipeline with its context', async () => {
    await recordPipelineRetrieval(context);

    expect(mockGetPipelinePhaseRuns).toHaveBeenCalledWith({
      ...context,
      loadPhase: expect.any(Function),
    });
  });

  it('loads only the alert retrieval run', async () => {
    await recordPipelineRetrieval(context);
    const [[{ loadPhase }]] = mockGetPipelinePhaseRuns.mock.calls;

    expect(selectedPhases(loadPhase)).toEqual(['alertRetrieval']);
  });

  it('writes nothing when the alert retrieval run could not be loaded', async () => {
    mockGetPipelinePhaseRuns.mockResolvedValue({
      alertRetrieval: { status: alertRetrieval.status, tracking: alertRetrieval.tracking },
    });

    await recordPipelineRetrieval(context);

    expect(mockWriteAlertRetrievalStartedEvent).not.toHaveBeenCalled();
  });

  it('writes alert-retrieval-started with the run reference', async () => {
    await recordPipelineRetrieval(context);

    expect(mockWriteAlertRetrievalStartedEvent).toHaveBeenCalledWith(expectedEvent);
  });

  it('writes alert-retrieval-succeeded with the alerts context count and end time', async () => {
    await recordPipelineRetrieval(context);

    expect(mockWriteAlertRetrievalSucceededEvent).toHaveBeenCalledWith({
      ...expectedEvent,
      alertsContextCount: 7,
      endTime: new Date('2026-10-16T11:02:00.000Z'),
    });
  });

  it('writes started before succeeded', async () => {
    await recordPipelineRetrieval(context);

    expect(mockWriteAlertRetrievalStartedEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mockWriteAlertRetrievalSucceededEvent.mock.invocationCallOrder[0]
    );
  });

  it('extracts the alerts context count from the retrieval run', async () => {
    await recordPipelineRetrieval(context);

    expect(mockExtractAlertRetrievalResult).toHaveBeenCalledWith({
      apiConfig: context.apiConfig,
      execution: alertRetrieval.execution,
    });
  });

  describe('when there is no alert retrieval run', () => {
    beforeEach(() => {
      mockGetPipelinePhaseRuns.mockResolvedValue({});
    });

    it('logs a warning', async () => {
      await recordPipelineRetrieval(context);

      expect(logger.warn).toHaveBeenCalledWith(
        'No alert retrieval run found for pipeline generation execution-uuid'
      );
    });

    it('writes nothing', async () => {
      await recordPipelineRetrieval(context);

      expect([
        mockWriteAlertRetrievalStartedEvent.mock.calls.length,
        mockWriteAlertRetrievalSucceededEvent.mock.calls.length,
      ]).toEqual([0, 0]);
    });
  });
});
