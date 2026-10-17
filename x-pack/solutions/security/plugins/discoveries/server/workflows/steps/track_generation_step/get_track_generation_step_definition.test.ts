/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup, Logger } from '@kbn/core/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';

import { resolveConnectorDetails } from '../../helpers/resolve_connector_details';
import { resolveDefaultConnectorId } from '../../helpers/resolve_default_connector_id';
import { getTrackGenerationStepDefinition } from './get_track_generation_step_definition';

const mockCheckManagedWorkflowIntegrity = jest.fn();
const mockGetStrandedPreviousRunId = jest.fn();
const mockReconcilePipelineGenerations = jest.fn();
const mockIsWorkflowsEnabledForSpace = jest.fn();
const mockRecordPipelineFailure = jest.fn();
const mockRecordPipelineGeneration = jest.fn();
const mockRecordPipelineRetrieval = jest.fn();
const mockRecordPipelineSuccess = jest.fn();
const mockStartPipelineGeneration = jest.fn();

jest.mock('@kbn/discoveries/impl/attack_discovery/generation/track_pipeline_generation', () => ({
  getStrandedPreviousRunId: (...args: unknown[]) => mockGetStrandedPreviousRunId(...args),
  reconcilePipelineGenerations: (...args: unknown[]) => mockReconcilePipelineGenerations(...args),
  recordPipelineFailure: (...args: unknown[]) => mockRecordPipelineFailure(...args),
  recordPipelineGeneration: (...args: unknown[]) => mockRecordPipelineGeneration(...args),
  recordPipelineRetrieval: (...args: unknown[]) => mockRecordPipelineRetrieval(...args),
  recordPipelineSuccess: (...args: unknown[]) => mockRecordPipelineSuccess(...args),
  startPipelineGeneration: (...args: unknown[]) => mockStartPipelineGeneration(...args),
}));

jest.mock('../../../managed_workflows/check_managed_workflow_integrity', () => ({
  checkManagedWorkflowIntegrity: (...args: unknown[]) => mockCheckManagedWorkflowIntegrity(...args),
}));

jest.mock('../../../lib/is_workflows_enabled_for_space', () => ({
  isWorkflowsEnabledForSpace: (...args: unknown[]) => mockIsWorkflowsEnabledForSpace(...args),
}));

jest.mock('../../helpers/resolve_connector_details', () => ({
  resolveConnectorDetails: jest.fn(),
}));

jest.mock('../../helpers/resolve_default_connector_id', () => ({
  resolveDefaultConnectorId: jest.fn(),
}));

jest.mock('./helpers/get_pipeline_execution_uuid', () => ({
  getPipelineExecutionUuid: (runId: string) => `generation-of-${runId}`,
}));

const mockResolveConnectorDetails = resolveConnectorDetails as jest.MockedFunction<
  typeof resolveConnectorDetails
>;

const mockResolveDefaultConnectorId = resolveDefaultConnectorId as jest.MockedFunction<
  typeof resolveDefaultConnectorId
>;

describe('getTrackGenerationStepDefinition', () => {
  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger;

  const analytics = { reportEvent: jest.fn() } as unknown as AnalyticsServiceSetup;
  const authz = { mode: {} };
  const mockActionsClient = { get: jest.fn() };
  const mockUiSettingsClient = { get: jest.fn() };
  const mockEventLogger = { logEvent: jest.fn() };
  const mockAuthenticate = jest.fn();
  const fakeRequest = { headers: {} };
  const pipelineStartedAt = new Date('2026-10-16T11:00:00.000Z');
  const workflowsExtensions = { getManagedWorkflows: jest.fn() };
  const workflowsManagementApi = {
    getChildWorkflowExecutions: jest.fn(),
  } as unknown as WorkflowsServerPluginSetup['management'];

  const startServices = {
    coreStart: {
      elasticsearch: {
        client: {
          asScoped: jest.fn().mockReturnValue({
            asCurrentUser: { security: { authenticate: mockAuthenticate } },
          }),
        },
      },
      featureFlags: {},
      savedObjects: {
        getScopedClient: jest.fn().mockReturnValue({}),
      },
      uiSettings: {
        asScopedToClient: jest.fn().mockReturnValue(mockUiSettingsClient),
      },
    },
    pluginsStart: {
      actions: {
        getActionsClientWithRequest: jest.fn().mockResolvedValue(mockActionsClient),
      },
      security: { authz },
      workflowsExtensions,
    },
  };

  const mockGetStartServices = jest.fn();
  const mockGetEventLogIndex = jest.fn();
  const mockGetEventLogger = jest.fn();

  const buildContext = (
    input: Record<string, unknown>,
    execution: Record<string, unknown> = { id: 'pipeline-run-1', startedAt: pipelineStartedAt }
  ) => ({
    abortSignal: new AbortController().signal,
    contextManager: {
      getContext: jest.fn().mockReturnValue({
        execution,
        workflow: { id: 'pipeline-workflow-1', spaceId: 'default' },
      }),
      getFakeRequest: jest.fn().mockReturnValue(fakeRequest),
      getScopedEsClient: jest.fn(),
      renderInputTemplate: jest.fn(),
    },
    input,
    logger: {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
    stepId: 'track-step-1',
    stepType: 'security.attack-discovery.trackGeneration',
  });

  const apiConfig = { action_type_id: '.gen-ai', connector_id: 'test-connector' };

  const getStepDefinition = (
    overrides: Partial<Parameters<typeof getTrackGenerationStepDefinition>[0]> = {}
  ) =>
    getTrackGenerationStepDefinition({
      analytics,
      getEventLogIndex: mockGetEventLogIndex,
      getEventLogger: mockGetEventLogger,
      getStartServices: mockGetStartServices,
      logger: mockLogger,
      workflowsManagementApi,
      ...overrides,
    });

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthenticate.mockResolvedValue({ username: 'elastic' });
    mockGetEventLogIndex.mockResolvedValue('.kibana-event-log-test');
    mockGetEventLogger.mockResolvedValue(mockEventLogger);
    mockGetStartServices.mockResolvedValue(startServices);
    mockIsWorkflowsEnabledForSpace.mockResolvedValue(true);
    mockRecordPipelineFailure.mockResolvedValue(undefined);
    mockRecordPipelineGeneration.mockResolvedValue(undefined);
    mockRecordPipelineRetrieval.mockResolvedValue(undefined);
    mockRecordPipelineSuccess.mockResolvedValue(undefined);
    mockResolveConnectorDetails.mockResolvedValue({
      actionTypeId: '.gen-ai',
      connectorName: 'Test Connector',
    });
    mockResolveDefaultConnectorId.mockResolvedValue('default-connector');
    mockStartPipelineGeneration.mockResolvedValue(undefined);
    mockGetStrandedPreviousRunId.mockResolvedValue('previous-run-1');
    mockReconcilePipelineGenerations.mockResolvedValue(2);
  });

  describe('step definition metadata', () => {
    it('has the correct id', () => {
      expect(getStepDefinition().id).toBe('security.attack-discovery.trackGeneration');
    });
  });

  describe('started phase', () => {
    const startedInput = { connector_id: 'test-connector', phase: 'started' };

    it('returns the api_config, connector_name, and execution_uuid of the run', async () => {
      const result = await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(result).toEqual({
        output: {
          api_config: apiConfig,
          connector_name: 'Test Connector',
          execution_uuid: 'generation-of-pipeline-run-1',
        },
      });
    });

    it('starts the pipeline generation with the run id and workflow id of the pipeline', async () => {
      await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(mockStartPipelineGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            analytics,
            apiConfig: {
              action_type_id: '.gen-ai',
              connector_id: 'test-connector',
              model: undefined,
              provider: undefined,
            },
            eventLogIndex: '.kibana-event-log-test',
            eventLogger: mockEventLogger,
            executionUuid: 'generation-of-pipeline-run-1',
            pipelineRunId: 'pipeline-run-1',
            pipelineStartedAt,
            pipelineWorkflowId: 'pipeline-workflow-1',
            request: fakeRequest,
            spaceId: 'default',
            workflowsManagementApi,
          }),
        })
      );
    });

    it('starts the pipeline generation with the size, alerts index, and authz of the space', async () => {
      await getStepDefinition().handler(buildContext({ ...startedInput, size: 250 }) as never);

      expect(mockStartPipelineGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          alertsCount: 250,
          alertsIndexPattern: '.alerts-security.alerts-default',
          authz,
        })
      );
    });

    it('defaults the size to 100 and the alert retrieval mode to custom_query', async () => {
      await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(mockStartPipelineGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          alertsCount: 100,
          workflowConfig: expect.objectContaining({ alert_retrieval_mode: 'custom_query' }),
        })
      );
    });

    it('records the authenticated user of the request', async () => {
      await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(mockStartPipelineGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            authenticatedUser: expect.objectContaining({ username: 'elastic' }),
          }),
        })
      );
    });

    it('checks managed workflow integrity with the analytics and workflows extensions', async () => {
      await getStepDefinition().handler(buildContext(startedInput) as never);
      const [{ checkIntegrity }] = mockStartPipelineGeneration.mock.calls[0];

      await checkIntegrity({ logger: mockLogger, spaceId: 'my-space' });

      expect(mockCheckManagedWorkflowIntegrity).toHaveBeenCalledWith({
        analytics,
        logger: mockLogger,
        spaceId: 'my-space',
        workflowsExtensions,
      });
    });

    it('uses the explicit connector without resolving a default', async () => {
      await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(mockResolveDefaultConnectorId).not.toHaveBeenCalled();
    });

    it('resolves the connector details of the explicit connector', async () => {
      await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(mockResolveConnectorDetails).toHaveBeenCalledWith({
        actionsClient: mockActionsClient,
        connectorId: 'test-connector',
        inference: undefined,
        logger: mockLogger,
        request: fakeRequest,
      });
    });

    it('resolves the default connector, with the feature id, when connector_id is empty', async () => {
      await getStepDefinition().handler(
        buildContext({ connector_id: '', feature_id: 'my_feature', phase: 'started' }) as never
      );

      expect(mockResolveDefaultConnectorId).toHaveBeenCalledWith({
        featureId: 'my_feature',
        inference: undefined,
        logger: mockLogger,
        request: fakeRequest,
        searchInferenceEndpoints: undefined,
        uiSettingsClient: mockUiSettingsClient,
      });
    });

    it('returns the resolved default connector in the api_config when connector_id is omitted', async () => {
      const result = await getStepDefinition().handler(buildContext({ phase: 'started' }) as never);

      expect(result.output?.api_config).toEqual({
        action_type_id: '.gen-ai',
        connector_id: 'default-connector',
      });
    });

    it('returns an error when Attack Discovery workflows are not enabled for the space', async () => {
      mockIsWorkflowsEnabledForSpace.mockResolvedValue(false);

      const result = await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(result.error?.message).toBe(
        'Attack Discovery workflows are not enabled for this space'
      );
    });

    it('does not start the pipeline generation when workflows are not enabled for the space', async () => {
      mockIsWorkflowsEnabledForSpace.mockResolvedValue(false);

      await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(mockStartPipelineGeneration).not.toHaveBeenCalled();
    });

    it('returns an error when startPipelineGeneration throws', async () => {
      mockStartPipelineGeneration.mockRejectedValue(new Error('Connector missing'));

      const result = await getStepDefinition().handler(buildContext(startedInput) as never);

      expect(result).toEqual({ error: new Error('Connector missing') });
    });

    it('logs an error when startPipelineGeneration throws', async () => {
      mockStartPipelineGeneration.mockRejectedValue(new Error('Connector missing'));
      const context = buildContext(startedInput);

      await getStepDefinition().handler(context as never);

      expect(context.logger.error).toHaveBeenCalledWith(
        'Attack Discovery generation could not start: Connector missing',
        expect.any(Error)
      );
    });

    it('returns an error when the Workflows management API is not available', async () => {
      const result = await getStepDefinition({ workflowsManagementApi: undefined }).handler(
        buildContext(startedInput) as never
      );

      expect(result.error?.message).toBe('The Workflows management API is not available');
    });
  });

  describe('later phases', () => {
    const laterInput = {
      api_config: apiConfig,
      execution_uuid: 'generation-of-pipeline-run-1',
    };

    it.each([
      ['retrieval_completed', mockRecordPipelineRetrieval],
      ['generation_completed', mockRecordPipelineGeneration],
    ])('%s records the phase with the pipeline context', async (phase, recordPhase) => {
      await getStepDefinition().handler(buildContext({ ...laterInput, phase }) as never);

      expect(recordPhase).toHaveBeenCalledWith(
        expect.objectContaining({
          executionUuid: 'generation-of-pipeline-run-1',
          pipelineRunId: 'pipeline-run-1',
          pipelineWorkflowId: 'pipeline-workflow-1',
        })
      );
    });

    it('succeeded records the success with the size and workflow config', async () => {
      await getStepDefinition().handler(
        buildContext({ ...laterInput, phase: 'succeeded', size: 50 }) as never
      );

      expect(mockRecordPipelineSuccess).toHaveBeenCalledWith({
        alertsCount: 50,
        context: expect.objectContaining({ executionUuid: 'generation-of-pipeline-run-1' }),
        workflowConfig: expect.objectContaining({ default_retrieval_enabled: true }),
      });
    });

    it('failed records the failure with the error message', async () => {
      await getStepDefinition().handler(
        buildContext({ ...laterInput, error_message: 'boom', phase: 'failed' }) as never
      );

      expect(mockRecordPipelineFailure).toHaveBeenCalledWith({
        context: expect.objectContaining({ executionUuid: 'generation-of-pipeline-run-1' }),
        errorMessage: 'boom',
      });
    });

    it.each(['retrieval_completed', 'generation_completed', 'succeeded', 'failed'])(
      '%s returns the execution_uuid of the run',
      async (phase) => {
        const result = await getStepDefinition().handler(
          buildContext({ ...laterInput, phase }) as never
        );

        expect(result).toEqual({ output: { execution_uuid: 'generation-of-pipeline-run-1' } });
      }
    );

    it('does not check the per-space setting or resolve a connector', async () => {
      await getStepDefinition().handler(
        buildContext({ ...laterInput, phase: 'retrieval_completed' }) as never
      );

      expect([
        mockIsWorkflowsEnabledForSpace.mock.calls.length,
        mockResolveConnectorDetails.mock.calls.length,
        mockStartPipelineGeneration.mock.calls.length,
      ]).toEqual([0, 0, 0]);
    });

    it.each([
      ['retrieval_completed', mockRecordPipelineRetrieval],
      ['generation_completed', mockRecordPipelineGeneration],
      ['succeeded', mockRecordPipelineSuccess],
      ['failed', mockRecordPipelineFailure],
    ])('%s returns output, not an error, when recording throws', async (phase, recordPhase) => {
      recordPhase.mockRejectedValue(new Error('event log unavailable'));

      const result = await getStepDefinition().handler(
        buildContext({ ...laterInput, phase }) as never
      );

      expect(result).toEqual({ output: { execution_uuid: 'generation-of-pipeline-run-1' } });
    });

    it('logs a warning when recording a later phase throws', async () => {
      mockRecordPipelineGeneration.mockRejectedValue(new Error('event log unavailable'));
      const context = buildContext({ ...laterInput, phase: 'generation_completed' });

      await getStepDefinition().handler(context as never);

      expect(context.logger.warn).toHaveBeenCalledWith(
        'Failed to record the generation_completed phase of the generation: event log unavailable'
      );
    });

    it.each([
      ['retrieval_completed', mockRecordPipelineRetrieval],
      ['generation_completed', mockRecordPipelineGeneration],
      ['succeeded', mockRecordPipelineSuccess],
      ['failed', mockRecordPipelineFailure],
    ])('%s records nothing for a generation another run started', async (phase, recordPhase) => {
      await getStepDefinition().handler(
        buildContext({ ...laterInput, execution_uuid: 'generation-of-other-run', phase }) as never
      );

      expect(recordPhase).not.toHaveBeenCalled();
    });

    it('logs a warning for a generation another run started', async () => {
      const context = buildContext({
        ...laterInput,
        execution_uuid: 'generation-of-other-run',
        phase: 'succeeded',
      });

      await getStepDefinition().handler(context as never);

      expect(context.logger.warn).toHaveBeenCalledWith(
        'Failed to record the succeeded phase of the generation: The succeeded phase can only record the generation this run started'
      );
    });

    it('returns output with a warning when execution_uuid is missing', async () => {
      const context = buildContext({ api_config: apiConfig, phase: 'succeeded' });

      const result = await getStepDefinition().handler(context as never);

      expect({ result, warn: context.logger.warn.mock.calls }).toEqual({
        result: { output: { execution_uuid: '' } },
        warn: [
          [
            'Failed to record the succeeded phase of the generation: The succeeded phase needs the api_config and execution_uuid of the run',
          ],
        ],
      });
    });

    it('returns output with a warning when api_config is missing', async () => {
      const context = buildContext({
        execution_uuid: 'generation-of-pipeline-run-1',
        phase: 'retrieval_completed',
      });

      const result = await getStepDefinition().handler(context as never);

      expect({ result, warn: context.logger.warn.mock.calls }).toEqual({
        result: { output: { execution_uuid: 'generation-of-pipeline-run-1' } },
        warn: [
          [
            'Failed to record the retrieval_completed phase of the generation: The retrieval_completed phase needs the api_config and execution_uuid of the run',
          ],
        ],
      });
    });

    it('does not record a phase when the run inputs are missing', async () => {
      await getStepDefinition().handler(buildContext({ phase: 'retrieval_completed' }) as never);

      expect(mockRecordPipelineRetrieval).not.toHaveBeenCalled();
    });

    it('returns output, not an error, when the Workflows management API is not available', async () => {
      const result = await getStepDefinition({ workflowsManagementApi: undefined }).handler(
        buildContext({ ...laterInput, phase: 'failed' }) as never
      );

      expect(result).toEqual({ output: { execution_uuid: 'generation-of-pipeline-run-1' } });
    });
  });

  describe('reconcile phase', () => {
    const inheritedExecution = {
      effectiveIdentity: {
        id: 'kibana/alertzero_attack_discovery',
        inheritedFrom: { workloadId: 'system-security-floor-attack-discovery-default' },
        type: 'service_account',
      },
      id: 'batched-generation-run-1',
      startedAt: pipelineStartedAt,
    };

    it('reconciles the batch pipelines this run started when the scope is this_run', async () => {
      await getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'this_run' }, inheritedExecution) as never
      );

      expect(mockReconcilePipelineGenerations).toHaveBeenCalledWith(
        expect.objectContaining({
          parentExecutionId: 'batched-generation-run-1',
          pipelineWorkflowId: 'system-security-attack-discovery-batch-pipeline',
          spaceId: 'default',
        })
      );
    });

    it('looks up the previous run of the same workflow when the scope is previous_run', async () => {
      await getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'previous_run' }, inheritedExecution) as never
      );

      expect(mockGetStrandedPreviousRunId).toHaveBeenCalledWith({
        currentRunId: 'batched-generation-run-1',
        request: fakeRequest,
        spaceId: 'default',
        workflowId: 'pipeline-workflow-1',
        workflowsManagementApi,
        workloadId: 'system-security-floor-attack-discovery-default',
      });
    });

    it('reconciles the batch pipelines of a stranded previous run', async () => {
      await getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'previous_run' }, inheritedExecution) as never
      );

      expect(mockReconcilePipelineGenerations).toHaveBeenCalledWith(
        expect.objectContaining({ parentExecutionId: 'previous-run-1' })
      );
    });

    it('does nothing when the previous run is not stranded', async () => {
      mockGetStrandedPreviousRunId.mockResolvedValue(undefined);

      await getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'previous_run' }, inheritedExecution) as never
      );

      expect(mockReconcilePipelineGenerations).not.toHaveBeenCalled();
    });

    it('returns the number of generations it marked failed', async () => {
      const result = await getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'this_run' }, inheritedExecution) as never
      );

      expect(result).toEqual({ output: { execution_uuid: '', reconciled: 2 } });
    });

    it('returns output, not an error, when reconciling throws', async () => {
      mockReconcilePipelineGenerations.mockRejectedValue(new Error('workflows unavailable'));

      const result = await getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'this_run' }, inheritedExecution) as never
      );

      expect(result).toEqual({ output: { execution_uuid: '', reconciled: 0 } });
    });

    it.each([
      ['a user', { id: 'pipeline-run-1', startedAt: pipelineStartedAt }],
      [
        'a service account of its own',
        {
          effectiveIdentity: { id: 'kibana/some_account', type: 'service_account' },
          id: 'pipeline-run-1',
          startedAt: pipelineStartedAt,
        },
      ],
    ])('reconciles nothing for a run as %s', async (_, execution) => {
      const result = await getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'this_run' }, execution) as never
      );

      expect({
        reconciled: mockReconcilePipelineGenerations.mock.calls.length,
        result,
      }).toEqual({ reconciled: 0, result: { output: { execution_uuid: '', reconciled: 0 } } });
    });

    it('logs a warning when the run did not inherit a service account', async () => {
      const context = buildContext({ phase: 'reconcile', scope: 'this_run' });

      await getStepDefinition().handler(context as never);

      expect(context.logger.warn).toHaveBeenCalledWith(
        'Failed to record the reconcile phase of the generation: The reconcile phase only runs in a workflow that inherited a service account'
      );
    });

    it('does not run the started-phase checks', async () => {
      await getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'this_run' }, inheritedExecution) as never
      );

      expect([
        mockIsWorkflowsEnabledForSpace.mock.calls.length,
        mockResolveConnectorDetails.mock.calls.length,
        mockStartPipelineGeneration.mock.calls.length,
      ]).toEqual([0, 0, 0]);
    });
  });

  describe('deadline', () => {
    const never = () => new Promise<never>(() => {});
    const inheritedExecution = {
      effectiveIdentity: {
        id: 'kibana/alertzero_attack_discovery',
        inheritedFrom: { workloadId: 'system-security-floor-attack-discovery-default' },
        type: 'service_account',
      },
      id: 'pipeline-run-1',
      startedAt: pipelineStartedAt,
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns the execution_uuid once recording a later phase takes 20s', async () => {
      mockRecordPipelineSuccess.mockImplementation(never);
      const pending = getStepDefinition().handler(
        buildContext({
          api_config: apiConfig,
          execution_uuid: 'generation-of-pipeline-run-1',
          phase: 'succeeded',
        }) as never
      );
      await jest.advanceTimersByTimeAsync(20_000);

      await expect(pending).resolves.toEqual({
        output: { execution_uuid: 'generation-of-pipeline-run-1' },
      });
    });

    it('logs a warning when recording a later phase takes 20s', async () => {
      mockRecordPipelineFailure.mockImplementation(never);
      const context = buildContext({
        api_config: apiConfig,
        execution_uuid: 'generation-of-pipeline-run-1',
        phase: 'failed',
      });
      const pending = getStepDefinition().handler(context as never);
      await jest.advanceTimersByTimeAsync(20_000);
      await pending;

      expect(context.logger.warn).toHaveBeenCalledWith(
        'Stopped waiting for the failed phase of the generation after 20s'
      );
    });

    it('returns no reconciled generations once reconciling takes 20s', async () => {
      mockReconcilePipelineGenerations.mockImplementation(never);
      const pending = getStepDefinition().handler(
        buildContext({ phase: 'reconcile', scope: 'this_run' }, inheritedExecution) as never
      );
      await jest.advanceTimersByTimeAsync(20_000);

      await expect(pending).resolves.toEqual({ output: { execution_uuid: '', reconciled: 0 } });
    });

    it('waits for the started phase past 20s, because it gates the run', async () => {
      mockStartPipelineGeneration.mockImplementation(never);
      const onSettled = jest.fn();
      void getStepDefinition()
        .handler(buildContext({ connector_id: 'test-connector', phase: 'started' }) as never)
        .then(onSettled);
      await jest.advanceTimersByTimeAsync(60_000);

      expect(onSettled).not.toHaveBeenCalled();
    });
  });
});
