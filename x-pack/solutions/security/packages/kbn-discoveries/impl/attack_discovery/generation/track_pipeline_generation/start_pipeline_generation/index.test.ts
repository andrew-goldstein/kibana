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
import type { SecurityPluginStart } from '@kbn/security-plugin/server';

import type { WorkflowConfig } from '../../types';
import type { PipelineGenerationContext, PipelineWorkflowsApi } from '../types';
import { startPipelineGeneration } from '.';

const mockAssertAuthorizedToExecuteWorkflows = jest.fn();
const mockBuildDiagnosticsContext = jest.fn();
const mockBuildResolveConnector = jest.fn();
const mockGetWorkflowLoadingMessage = jest.fn();
const mockRefreshEventLogIndex = jest.fn();
const mockReportPreExecutionMisconfigurations = jest.fn();
const mockValidatePreExecution = jest.fn();
const mockVerifyWorkflowIntegrity = jest.fn();
const mockWriteGenerationStartedEvent = jest.fn();

jest.mock('../../assert_authorized_to_execute_workflows', () => ({
  assertAuthorizedToExecuteWorkflows: (...args: unknown[]) =>
    mockAssertAuthorizedToExecuteWorkflows(...args),
}));

jest.mock('../../build_resolve_connector', () => ({
  buildResolveConnector: (...args: unknown[]) => mockBuildResolveConnector(...args),
}));

jest.mock('../../execute_generation_workflow', () => ({
  buildDiagnosticsContext: (...args: unknown[]) => mockBuildDiagnosticsContext(...args),
  reportPreExecutionMisconfigurations: (...args: unknown[]) =>
    mockReportPreExecutionMisconfigurations(...args),
}));

jest.mock('../../get_workflow_loading_message', () => ({
  getWorkflowLoadingMessage: (...args: unknown[]) => mockGetWorkflowLoadingMessage(...args),
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

jest.mock('../../validate_pre_execution', () => ({
  validatePreExecution: (...args: unknown[]) => mockValidatePreExecution(...args),
}));

jest.mock('../../verify_workflow_integrity', () => ({
  verifyWorkflowIntegrity: (...args: unknown[]) => mockVerifyWorkflowIntegrity(...args),
}));

jest.mock('../../write_generation_started_event', () => ({
  writeGenerationStartedEvent: (...args: unknown[]) => mockWriteGenerationStartedEvent(...args),
}));

const analytics = { reportEvent: jest.fn() } as unknown as AnalyticsServiceSetup;
const authenticatedUser = { username: 'elastic' } as unknown as AuthenticatedUser;
const authz = {} as unknown as SecurityPluginStart['authz'];
const coreStart = {} as unknown as CoreStart;
const esClient = {} as unknown as ElasticsearchClient;
const eventLogger = {} as unknown as IEventLogger;
const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as Logger;
const request = { headers: {} } as unknown as KibanaRequest;
const resolveConnector = jest.fn();
const workflowsManagementApi = {} as unknown as PipelineWorkflowsApi;

const workflowConfig: WorkflowConfig = {
  alert_retrieval_mode: 'custom_query',
  alert_retrieval_workflow_ids: [],
  alert_retrieval_workflows_enabled: false,
  default_retrieval_enabled: true,
  skill_enabled: false,
  validation_workflow_id: '',
};

const buildContext = (
  overrides: Partial<PipelineGenerationContext> = {}
): PipelineGenerationContext => ({
  analytics,
  apiConfig: { action_type_id: '.gen-ai', connector_id: 'connector-1' },
  authenticatedUser,
  coreStart,
  esClient,
  eventLogIndex: '.kibana-event-log-test',
  eventLogger,
  executionUuid: 'execution-uuid',
  logger,
  pipelineRunId: 'pipeline-run',
  pipelineStartedAt: new Date('2026-10-16T11:00:00.000Z'),
  pipelineWorkflowId: 'pipeline-workflow',
  request,
  spaceId: 'default',
  workflowsManagementApi,
  ...overrides,
});

const getStartServices = jest.fn();

const integrityResult = { repaired: [], status: 'all_intact', unrepairableErrors: [] };
const verifiedWorkflowIds = {
  default_alert_retrieval: 'retrieval-workflow',
  generation: 'generation-workflow',
  validate: 'validation-workflow',
};

const start = (
  overrides: Partial<Parameters<typeof startPipelineGeneration>[0]> = {}
): Promise<void> =>
  startPipelineGeneration({
    alertsCount: 100,
    alertsIndexPattern: '.alerts-security.alerts-default',
    authz,
    checkIntegrity: undefined,
    context: buildContext(),
    getStartServices,
    workflowConfig,
    ...overrides,
  });

describe('startPipelineGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockAssertAuthorizedToExecuteWorkflows.mockResolvedValue(undefined);
    mockBuildDiagnosticsContext.mockReturnValue({ diagnostics: true });
    mockBuildResolveConnector.mockReturnValue(resolveConnector);
    mockGetWorkflowLoadingMessage.mockReturnValue('loading message');
    mockRefreshEventLogIndex.mockResolvedValue(undefined);
    mockValidatePreExecution.mockResolvedValue({ issues: [], valid: true });
    mockVerifyWorkflowIntegrity.mockResolvedValue({
      integrityResult,
      updatedIds: verifiedWorkflowIds,
    });
    mockWriteGenerationStartedEvent.mockResolvedValue(new Date());
  });

  it('writes generation-started with the pipeline workflow id and run id', async () => {
    await start();

    expect(mockWriteGenerationStartedEvent).toHaveBeenCalledWith({
      authenticatedUser,
      connectorId: 'connector-1',
      diagnosticsContext: { diagnostics: true },
      eventLogger,
      eventLogIndex: '.kibana-event-log-test',
      executionUuid: 'execution-uuid',
      loadingMessage: 'loading message',
      spaceId: 'default',
      workflowId: 'pipeline-workflow',
      workflowRunId: 'pipeline-run',
    });
  });

  it('builds the diagnostics context from the check results', async () => {
    const preExecutionResult = { issues: [], valid: true };
    mockValidatePreExecution.mockResolvedValue(preExecutionResult);

    await start();

    expect(mockBuildDiagnosticsContext).toHaveBeenCalledWith({
      integrityResult,
      parsedApiConfig: { action_type_id: '.gen-ai', connector_id: 'connector-1' },
      preExecutionResult,
      verifiedWorkflowIds,
      workflowConfig,
    });
  });

  it('builds the loading message from the alerts count and workflow config', async () => {
    await start({ alertsCount: 42 });

    expect(mockGetWorkflowLoadingMessage).toHaveBeenCalledWith({
      alertsCount: 42,
      workflowConfig,
    });
  });

  it('refreshes the event log index after writing generation-started', async () => {
    await start();

    expect(mockRefreshEventLogIndex.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockWriteGenerationStartedEvent.mock.invocationCallOrder[0]
    );
  });

  it('refreshes the event log index with the request of the run', async () => {
    await start();

    expect(mockRefreshEventLogIndex).toHaveBeenCalledWith({
      coreStart,
      esClient,
      eventLogIndex: '.kibana-event-log-test',
      logger,
      request,
    });
  });

  it('checks authorization with the request and space', async () => {
    await start();

    expect(mockAssertAuthorizedToExecuteWorkflows).toHaveBeenCalledWith({
      authz,
      request,
      spaceId: 'default',
    });
  });

  it('throws, and writes nothing, when not authorized', async () => {
    mockAssertAuthorizedToExecuteWorkflows.mockRejectedValue(new Error('Unauthorized'));

    await expect(start()).rejects.toThrow('Unauthorized');

    expect(mockWriteGenerationStartedEvent).not.toHaveBeenCalled();
  });

  it('does not refresh the event log index when not authorized', async () => {
    mockAssertAuthorizedToExecuteWorkflows.mockRejectedValue(new Error('Unauthorized'));

    await expect(start()).rejects.toThrow('Unauthorized');

    expect(mockRefreshEventLogIndex).not.toHaveBeenCalled();
  });

  it('verifies integrity without a check when none is provided', async () => {
    await start();

    expect(mockVerifyWorkflowIntegrity).toHaveBeenCalledWith({
      checkIntegrity: undefined,
      defaultWorkflowIds: verifiedWorkflowIds,
      logger,
    });
  });

  it('verifies integrity with the logger and space of the run when a check is provided', async () => {
    const checkIntegrity = jest.fn().mockResolvedValue(integrityResult);

    await start({ checkIntegrity });
    const [{ checkIntegrity: wrapped }] = mockVerifyWorkflowIntegrity.mock.calls[0];
    await wrapped();

    expect(checkIntegrity).toHaveBeenCalledWith({ logger, spaceId: 'default' });
  });

  it('validates pre-execution with the connector, alerts index, and integrity result', async () => {
    await start();

    expect(mockValidatePreExecution).toHaveBeenCalledWith({
      alertsIndexPattern: '.alerts-security.alerts-default',
      connectorId: 'connector-1',
      esClient,
      logger,
      resolveConnector,
      workflowIntegrityResult: integrityResult,
      workflowsManagementApi,
    });
  });

  it('resolves the connector with the request and start services', async () => {
    await start();

    expect(mockBuildResolveConnector).toHaveBeenCalledWith({
      connectorId: 'connector-1',
      getStartServices,
      request,
    });
  });

  it('throws the joined critical messages when pre-execution is invalid', async () => {
    mockValidatePreExecution.mockResolvedValue({
      issues: [
        { check: 'connector', message: 'Connector missing', severity: 'critical' },
        { check: 'alerts', message: 'Few alerts', severity: 'warning' },
        { check: 'workflow', message: 'Workflow disabled', severity: 'critical' },
      ],
      valid: false,
    });

    await expect(start()).rejects.toThrow('Connector missing; Workflow disabled');
  });

  it('writes nothing when pre-execution is invalid', async () => {
    mockValidatePreExecution.mockResolvedValue({
      issues: [{ check: 'connector', message: 'Connector missing', severity: 'critical' }],
      valid: false,
    });

    await expect(start()).rejects.toThrow();

    expect(mockWriteGenerationStartedEvent).not.toHaveBeenCalled();
  });

  it('reports misconfigurations when there are issues and analytics is available', async () => {
    const issues = [{ check: 'alerts', message: 'Few alerts', severity: 'warning' }];
    mockValidatePreExecution.mockResolvedValue({ issues, valid: true });

    await start();

    expect(mockReportPreExecutionMisconfigurations).toHaveBeenCalledWith({
      analytics,
      issues,
      logger,
      spaceId: 'default',
    });
  });

  it('does not report misconfigurations when there are no issues', async () => {
    await start();

    expect(mockReportPreExecutionMisconfigurations).not.toHaveBeenCalled();
  });

  it('does not report misconfigurations when analytics is not available', async () => {
    mockValidatePreExecution.mockResolvedValue({
      issues: [{ check: 'alerts', message: 'Few alerts', severity: 'warning' }],
      valid: true,
    });

    await start({ context: buildContext({ analytics: undefined }) });

    expect(mockReportPreExecutionMisconfigurations).not.toHaveBeenCalled();
  });
});
