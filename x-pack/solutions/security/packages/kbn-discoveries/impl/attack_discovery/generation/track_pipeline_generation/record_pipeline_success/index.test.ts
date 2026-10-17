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

import type { WorkflowConfig } from '../../types';
import type {
  PipelineGenerationContext,
  PipelinePhaseRun,
  PipelinePhaseRuns,
  PipelineWorkflowsApi,
} from '../types';
import { recordPipelineSuccess } from '.';

const mockExtractAlertRetrievalResult = jest.fn();
const mockExtractGenerationWorkflowResult = jest.fn();
const mockExtractValidationResult = jest.fn();
const mockGetPipelinePhaseRuns = jest.fn();
const mockReportWorkflowSuccess = jest.fn();
const mockWriteAttackDiscoveryEvent = jest.fn();
const mockWriteValidationStartedEvent = jest.fn();
const mockWriteValidationSucceededEvent = jest.fn();

jest.mock('../../../../lib/telemetry/report_workflow_telemetry', () => ({
  reportWorkflowSuccess: (...args: unknown[]) => mockReportWorkflowSuccess(...args),
}));

jest.mock('../../../persistence/event_logging', () => ({
  ATTACK_DISCOVERY_EVENT_LOG_ACTION_GENERATION_SUCCEEDED: 'generation-succeeded',
  writeAttackDiscoveryEvent: (...args: unknown[]) => mockWriteAttackDiscoveryEvent(...args),
}));

jest.mock('../../extract_alert_retrieval_result', () => ({
  extractAlertRetrievalResult: (...args: unknown[]) => mockExtractAlertRetrievalResult(...args),
}));

jest.mock('../../invoke_generation_workflow', () => ({
  extractGenerationWorkflowResult: (...args: unknown[]) =>
    mockExtractGenerationWorkflowResult(...args),
}));

jest.mock('../../invoke_validation_workflow', () => ({
  extractValidationResult: (...args: unknown[]) => mockExtractValidationResult(...args),
  writeValidationStartedEvent: (...args: unknown[]) => mockWriteValidationStartedEvent(...args),
  writeValidationSucceededEvent: (...args: unknown[]) => mockWriteValidationSucceededEvent(...args),
}));

jest.mock('../../resolve_default_workflow_ids', () => ({
  resolveDefaultWorkflowIds: () => ({
    default_alert_retrieval: 'retrieval-workflow',
    generation: 'generation-workflow',
    validate: 'validation-workflow',
  }),
}));

jest.mock('../get_pipeline_phase_runs', () => ({
  getPipelinePhaseRuns: (...args: unknown[]) => mockGetPipelinePhaseRuns(...args),
}));

const analytics = { reportEvent: jest.fn() } as unknown as AnalyticsServiceSetup;
const authenticatedUser = { username: 'elastic' } as unknown as AuthenticatedUser;
const eventLogger = {} as unknown as IEventLogger;
const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as Logger;
const now = new Date('2026-10-16T11:10:00.000Z');
const pipelineStartedAt = new Date('2026-10-16T11:00:00.000Z');

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
  coreStart: {} as unknown as CoreStart,
  esClient: {} as unknown as ElasticsearchClient,
  eventLogIndex: '.kibana-event-log-test',
  eventLogger,
  executionUuid: 'execution-uuid',
  logger,
  pipelineRunId: 'pipeline-run',
  pipelineStartedAt,
  pipelineWorkflowId: 'pipeline-workflow',
  request: { headers: {} } as unknown as KibanaRequest,
  spaceId: 'default',
  workflowsManagementApi: {} as unknown as PipelineWorkflowsApi,
  ...overrides,
});

const workflowConfig: WorkflowConfig = {
  alert_retrieval_mode: 'custom_query',
  alert_retrieval_workflow_ids: [],
  alert_retrieval_workflows_enabled: false,
  default_retrieval_enabled: true,
  skill_enabled: false,
  validation_workflow_id: '',
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

const validation = buildRun({
  finishedAt: '2026-10-16T11:08:00.000Z',
  startedAt: '2026-10-16T11:06:00.000Z',
  workflowId: 'validation-workflow',
  workflowRunId: 'validation-run',
});

const allRuns: PipelinePhaseRuns = { alertRetrieval, generation, validation };

const validationSummary = { hallucinationsFilteredCount: 1, persistedCount: 2 };

const baseEvent = {
  authenticatedUser,
  connectorId: 'connector-1',
  eventLogger,
  eventLogIndex: '.kibana-event-log-test',
  executionUuid: 'execution-uuid',
  logger,
  spaceId: 'default',
};

describe('recordPipelineSuccess', () => {
  it('loads every phase run, because each one reports a count', async () => {
    mockGetPipelinePhaseRuns.mockResolvedValue({});

    await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });
    const [[{ loadPhase }]] = mockGetPipelinePhaseRuns.mock.calls;

    expect(
      ['alertRetrieval', 'generation', 'validation'].filter((phase) =>
        loadPhase(phase, ExecutionStatus.COMPLETED)
      )
    ).toEqual(['alertRetrieval', 'generation', 'validation']);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);

    mockExtractAlertRetrievalResult.mockReturnValue({ alertsContextCount: 9 });
    mockExtractGenerationWorkflowResult.mockReturnValue({
      alertsContextCount: 9,
      attackDiscoveries: [
        { alert_ids: ['alert-1', 'alert-2'] },
        { alert_ids: ['alert-2', 'alert-3'] },
        {},
      ],
    });
    mockExtractValidationResult.mockReturnValue({ duplicatesDroppedCount: 1, validationSummary });
    mockGetPipelinePhaseRuns.mockResolvedValue(allRuns);
    mockWriteAttackDiscoveryEvent.mockResolvedValue(undefined);
    mockWriteValidationStartedEvent.mockResolvedValue(undefined);
    mockWriteValidationSucceededEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when the pipeline ran every phase', () => {
    const workflowExecutions = {
      alertRetrieval: [alertRetrieval.tracking],
      gate: null,
      generation: generation.tracking,
      validation: validation.tracking,
    };

    it('writes validation-started with the validation run reference', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockWriteValidationStartedEvent).toHaveBeenCalledWith({
        ...baseEvent,
        startTime: new Date('2026-10-16T11:06:00.000Z'),
        workflowExecutions,
        workflowId: 'validation-workflow',
        workflowRunId: 'validation-run',
      });
    });

    it('writes validation-succeeded with the validation summary', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockWriteValidationSucceededEvent).toHaveBeenCalledWith({
        ...baseEvent,
        endTime: new Date('2026-10-16T11:08:00.000Z'),
        startTime: new Date('2026-10-16T11:06:00.000Z'),
        validationSummary,
        workflowExecutions,
        workflowId: 'validation-workflow',
        workflowRunId: 'validation-run',
      });
    });

    it('writes validation-started before validation-succeeded', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockWriteValidationStartedEvent.mock.invocationCallOrder[0]).toBeLessThan(
        mockWriteValidationSucceededEvent.mock.invocationCallOrder[0]
      );
    });

    it('extracts the validation result with the number of generated discoveries', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockExtractValidationResult).toHaveBeenCalledWith({
        execution: validation.execution,
        generatedCount: 3,
        logger,
      });
    });

    it('does not write a zero-alert generation-succeeded event', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockWriteAttackDiscoveryEvent).not.toHaveBeenCalled();
    });

    it('reports attack_discovery_success telemetry with the workflow trigger', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockReportWorkflowSuccess).toHaveBeenCalledWith({
        analytics,
        logger,
        params: {
          actionTypeId: '.gen-ai',
          alert_retrieval_mode: 'custom_query',
          alertsContextCount: 9,
          alertsCount: 3,
          configuredAlertsCount: 100,
          custom_retrieval_workflow_count: 0,
          dateRangeDuration: 0,
          discoveriesGenerated: 3,
          duplicatesDroppedCount: 1,
          durationMs: 10 * 60 * 1000,
          execution_mode: 'workflow',
          hallucinations_filtered_count: 1,
          hasFilter: false,
          isDefaultDateRange: true,
          model: 'gpt-test',
          prebuilt_step_types_used: [],
          provider: 'OpenAI',
          retrieval_workflow_count: 1,
          trigger: 'workflow',
          uses_default_retrieval: true,
          uses_default_validation: true,
          validation_discoveries_count: 2,
        },
      });
    });

    it('counts custom alert retrieval workflows in the telemetry', async () => {
      await recordPipelineSuccess({
        alertsCount: 100,
        context: buildContext(),
        workflowConfig: {
          ...workflowConfig,
          alert_retrieval_workflow_ids: ['custom-1', 'custom-2'],
          default_retrieval_enabled: false,
        },
      });

      expect(mockReportWorkflowSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            custom_retrieval_workflow_count: 2,
            retrieval_workflow_count: 2,
            uses_default_retrieval: false,
          }),
        })
      );
    });

    it('does not report telemetry when analytics is not available', async () => {
      await recordPipelineSuccess({
        alertsCount: 100,
        context: buildContext({ analytics: undefined }),
        workflowConfig,
      });

      expect(mockReportWorkflowSuccess).not.toHaveBeenCalled();
    });
  });

  describe('when the generation ran without a validation run', () => {
    beforeEach(() => {
      mockGetPipelinePhaseRuns.mockResolvedValue({ alertRetrieval, generation });
    });

    it('writes no validation events', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect([
        mockWriteValidationStartedEvent.mock.calls.length,
        mockWriteValidationSucceededEvent.mock.calls.length,
      ]).toEqual([0, 0]);
    });

    it('does not write a zero-alert generation-succeeded event', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockWriteAttackDiscoveryEvent).not.toHaveBeenCalled();
    });
  });

  describe('when retrieval found no alerts, so generation never ran', () => {
    beforeEach(() => {
      mockExtractAlertRetrievalResult.mockReturnValue({ alertsContextCount: 0 });
      mockGetPipelinePhaseRuns.mockResolvedValue({ alertRetrieval });
    });

    it('writes a zero-alert generation-succeeded event', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockWriteAttackDiscoveryEvent).toHaveBeenCalledWith({
        ...baseEvent,
        action: 'generation-succeeded',
        alertsContextCount: 0,
        dataClient: null,
        duration: 10 * 60 * 1000 * 1_000_000,
        end: now,
        message: 'Attack discovery generation execution-uuid succeeded with no alerts to analyze',
        outcome: 'success',
        start: pipelineStartedAt,
        workflowExecutions: {
          alertRetrieval: [alertRetrieval.tracking],
          gate: null,
          generation: null,
          validation: null,
        },
        workflowId: 'generation-workflow',
      });
    });

    it('writes no validation events', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect([
        mockWriteValidationStartedEvent.mock.calls.length,
        mockWriteValidationSucceededEvent.mock.calls.length,
      ]).toEqual([0, 0]);
    });

    it('reports telemetry with no discoveries generated', async () => {
      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(mockReportWorkflowSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            alertsContextCount: 0,
            alertsCount: 0,
            discoveriesGenerated: 0,
            duplicatesDroppedCount: undefined,
            hallucinations_filtered_count: undefined,
            validation_discoveries_count: undefined,
          }),
        })
      );
    });

    it('logs, and does not throw, when the zero-alert event cannot be written', async () => {
      mockWriteAttackDiscoveryEvent.mockRejectedValue(new Error('index unavailable'));

      await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to write generation-succeeded event for no-alerts outcome: index unavailable'
      );
    });
  });

  it('reports zero alerts in context when there is no alert retrieval run', async () => {
    mockGetPipelinePhaseRuns.mockResolvedValue({ generation, validation });

    await recordPipelineSuccess({ alertsCount: 100, context: buildContext(), workflowConfig });

    expect(mockReportWorkflowSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ alertsContextCount: 0 }),
      })
    );
  });
});
