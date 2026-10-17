/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowExecutionsTracking } from '@kbn/discoveries/impl/attack_discovery/persistence/event_logging';
import { httpServerMock, httpServiceMock } from '@kbn/core-http-server-mocks';

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';

import type { ChildWorkflowExecutionsApi } from '../pipeline_data/helpers/fill_tracking_from_pipeline_children';
import {
  getWorkflowExecutionsTracking,
  type EventLogData,
} from '../pipeline_data/helpers/get_workflow_executions_tracking';
import type { GetExecutionTrackingResponse } from './get_execution_tracking';

jest.mock('../pipeline_data/helpers/get_workflow_executions_tracking');
const mockGetWorkflowExecutionsTracking = getWorkflowExecutionsTracking as jest.MockedFunction<
  typeof getWorkflowExecutionsTracking
>;

jest.mock('../../../lib/assert_workflows_enabled', () => ({
  assertWorkflowsEnabled: jest.fn().mockResolvedValue(null),
}));

import { assertWorkflowsEnabled } from '../../../lib/assert_workflows_enabled';

const validTracking: WorkflowExecutionsTracking = {
  alertRetrieval: [
    {
      workflowId: 'workflow-default-alert-retrieval',
      workflowRunId: 'alert-retrieval-run-id',
    },
  ],
  gate: [
    {
      workflowId: 'workflow-gate',
      workflowRunId: 'gate-run-id',
    },
  ],
  generation: {
    workflowId: 'workflow-generation',
    workflowRunId: 'generation-run-id',
  },
  validation: {
    workflowId: 'workflow-validate',
    workflowRunId: 'validation-run-id',
  },
};

describe('getExecutionTracking response transformation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('transforms camelCase WorkflowExecutionsTracking to snake_case response', () => {
    const expected: GetExecutionTrackingResponse = {
      alert_retrieval: [
        {
          workflow_id: 'workflow-default-alert-retrieval',
          workflow_run_id: 'alert-retrieval-run-id',
        },
      ],
      gate: [
        {
          workflow_id: 'workflow-gate',
          workflow_run_id: 'gate-run-id',
        },
      ],
      generation: {
        workflow_id: 'workflow-generation',
        workflow_run_id: 'generation-run-id',
      },
      validation: {
        workflow_id: 'workflow-validate',
        workflow_run_id: 'validation-run-id',
      },
    };

    const result: GetExecutionTrackingResponse = {
      alert_retrieval:
        validTracking.alertRetrieval?.map((entry) => ({
          workflow_id: entry.workflowId,
          workflow_run_id: entry.workflowRunId,
        })) ?? null,
      gate:
        validTracking.gate?.map((entry) => ({
          workflow_id: entry.workflowId,
          workflow_run_id: entry.workflowRunId,
        })) ?? null,
      generation:
        validTracking.generation != null
          ? {
              workflow_id: validTracking.generation.workflowId,
              workflow_run_id: validTracking.generation.workflowRunId,
            }
          : null,
      validation:
        validTracking.validation != null
          ? {
              workflow_id: validTracking.validation.workflowId,
              workflow_run_id: validTracking.validation.workflowRunId,
            }
          : null,
    };

    expect(result).toEqual(expected);
  });

  it('handles null alertRetrieval, gate, generation, and validation', () => {
    const trackingWithNulls: WorkflowExecutionsTracking = {
      alertRetrieval: null,
      gate: null,
      generation: null,
      validation: null,
    };

    const result: GetExecutionTrackingResponse = {
      alert_retrieval:
        trackingWithNulls.alertRetrieval?.map((entry) => ({
          workflow_id: entry.workflowId,
          workflow_run_id: entry.workflowRunId,
        })) ?? null,
      gate:
        trackingWithNulls.gate?.map((entry) => ({
          workflow_id: entry.workflowId,
          workflow_run_id: entry.workflowRunId,
        })) ?? null,
      generation: null,
      validation: null,
    };

    expect(result).toEqual({
      alert_retrieval: null,
      gate: null,
      generation: null,
      validation: null,
    });
  });

  it('delegates to getWorkflowExecutionsTracking', async () => {
    mockGetWorkflowExecutionsTracking.mockResolvedValue(validTracking);

    const result = await getWorkflowExecutionsTracking({
      esClient: {} as never,
      eventLogIndex: '.kibana-event-log-test',
      executionId: 'test-execution-id',
      spaceId: 'default',
      username: 'test-user',
    });

    expect(mockGetWorkflowExecutionsTracking).toHaveBeenCalledWith({
      esClient: expect.anything(),
      eventLogIndex: '.kibana-event-log-test',
      executionId: 'test-execution-id',
      spaceId: 'default',
      username: 'test-user',
    });
    expect(result).toEqual(validTracking);
  });

  it('returns null when tracking is not found', async () => {
    mockGetWorkflowExecutionsTracking.mockResolvedValue(null);

    const result = await getWorkflowExecutionsTracking({
      esClient: {} as never,
      eventLogIndex: '.kibana-event-log-test',
      executionId: 'nonexistent-execution-id',
      spaceId: 'default',
      username: 'test-user',
    });

    expect(result).toBeNull();
  });
});

describe('registerGetExecutionTrackingRoute principal scoping', () => {
  const mockGetCurrentUser = jest.fn();
  const mockEsClient = { search: jest.fn() };

  const getStartServices = jest.fn().mockResolvedValue({
    coreStart: {
      elasticsearch: {
        client: {
          asScoped: () => ({
            asCurrentUser: mockEsClient,
          }),
        },
      },
      security: {
        authc: {
          getCurrentUser: mockGetCurrentUser,
        },
      },
    },
    pluginsStart: {
      spaces: { spacesService: null },
    },
  });

  const registerAndGetHandler = async () => {
    const { registerGetExecutionTrackingRoute } = await import('./get_execution_tracking');

    const router = httpServiceMock.createRouter();
    const addVersionMock = jest.fn();
    (router.versioned.get as jest.Mock).mockReturnValue({ addVersion: addVersionMock });

    registerGetExecutionTrackingRoute(router, {} as never, {
      getEventLogIndex: jest.fn().mockResolvedValue('.kibana-event-log-test'),
      getStartServices,
    });

    return addVersionMock.mock.calls[0][1] as (
      ctx: unknown,
      req: unknown,
      res: unknown
    ) => Promise<unknown>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (assertWorkflowsEnabled as jest.Mock).mockResolvedValue(null);
    mockGetCurrentUser.mockReturnValue({ username: 'test-user' });
  });

  it('scopes tracking retrieval to the requesting principal (object-level authz)', async () => {
    mockGetWorkflowExecutionsTracking.mockResolvedValue(null);

    const handler = await registerAndGetHandler();
    const request = httpServerMock.createKibanaRequest({ params: { execution_id: 'test-id' } });
    const response = httpServerMock.createResponseFactory();

    await handler({}, request, response);

    expect(mockGetWorkflowExecutionsTracking).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'test-user' })
    );
  });

  it('returns 403 when the requesting principal cannot be determined', async () => {
    mockGetCurrentUser.mockReturnValue(null);

    const handler = await registerAndGetHandler();
    const request = httpServerMock.createKibanaRequest({ params: { execution_id: 'test-id' } });
    const response = httpServerMock.createResponseFactory();

    await handler({}, request, response);

    expect(response.forbidden).toHaveBeenCalled();
    expect(mockGetWorkflowExecutionsTracking).not.toHaveBeenCalled();
  });
});

describe('registerGetExecutionTrackingRoute pipeline-backed generation', () => {
  const mockGetChildWorkflowExecutions = jest.fn();

  const getStartServices = jest.fn().mockResolvedValue({
    coreStart: {
      elasticsearch: {
        client: {
          asScoped: () => ({
            asCurrentUser: { search: jest.fn() },
          }),
        },
      },
      security: {
        authc: {
          getCurrentUser: () => ({ username: 'test-user' }),
        },
      },
    },
    pluginsStart: {
      spaces: { spacesService: null },
    },
  });

  const pipelineTracking: EventLogData = {
    alertRetrieval: [
      {
        workflowId: 'system-attack-discovery-alert-retrieval',
        workflowRunId: 'alert-retrieval-run-id',
      },
    ],
    gate: null,
    generation: null,
    pipelineRunId: 'pipeline-run-id',
    validation: null,
  };

  const registerAndGetHandler = async (
    {
      workflowsManagementApi,
    }: {
      workflowsManagementApi?: ChildWorkflowExecutionsApi;
    } = {
      workflowsManagementApi: { getChildWorkflowExecutions: mockGetChildWorkflowExecutions },
    }
  ) => {
    const { registerGetExecutionTrackingRoute } = await import('./get_execution_tracking');

    const router = httpServiceMock.createRouter();
    const addVersionMock = jest.fn();
    (router.versioned.get as jest.Mock).mockReturnValue({ addVersion: addVersionMock });

    registerGetExecutionTrackingRoute(router, loggingSystemMock.createLogger(), {
      getEventLogIndex: jest.fn().mockResolvedValue('.kibana-event-log-test'),
      getStartServices,
      workflowsManagementApi,
    });

    return addVersionMock.mock.calls[0][1] as (
      ctx: unknown,
      req: unknown,
      res: unknown
    ) => Promise<unknown>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (assertWorkflowsEnabled as jest.Mock).mockResolvedValue(null);
  });

  it("links a running generation child of the pipeline, read with the viewer's request", async () => {
    mockGetWorkflowExecutionsTracking.mockResolvedValue(pipelineTracking);
    mockGetChildWorkflowExecutions.mockResolvedValue([
      {
        executionId: 'generation-run-id',
        parentStepExecutionId: 'parent-step-id',
        status: 'running',
        stepExecutions: [],
        workflowId: 'system-attack-discovery-generation',
        workflowName: 'Attack discovery generation',
      },
    ]);

    const handler = await registerAndGetHandler();
    const request = httpServerMock.createKibanaRequest({ params: { execution_id: 'test-id' } });
    const response = httpServerMock.createResponseFactory();

    await handler({}, request, response);

    expect(mockGetChildWorkflowExecutions).toHaveBeenCalledWith(
      'pipeline-run-id',
      'default',
      request
    );
    expect(response.ok).toHaveBeenCalledWith({
      body: {
        alert_retrieval: [
          {
            workflow_id: 'system-attack-discovery-alert-retrieval',
            workflow_run_id: 'alert-retrieval-run-id',
          },
        ],
        gate: null,
        generation: {
          workflow_id: 'system-attack-discovery-generation',
          workflow_run_id: 'generation-run-id',
        },
        validation: null,
      },
    });
  });

  it('does not read child executions for an orchestrator-run generation', async () => {
    mockGetWorkflowExecutionsTracking.mockResolvedValue({
      ...pipelineTracking,
      pipelineRunId: undefined,
    });

    const handler = await registerAndGetHandler();
    const request = httpServerMock.createKibanaRequest({ params: { execution_id: 'test-id' } });

    await handler({}, request, httpServerMock.createResponseFactory());

    expect(mockGetChildWorkflowExecutions).not.toHaveBeenCalled();
  });

  it('returns the event-log tracking when the workflows management API is not available', async () => {
    mockGetWorkflowExecutionsTracking.mockResolvedValue(pipelineTracking);

    const handler = await registerAndGetHandler({});
    const request = httpServerMock.createKibanaRequest({ params: { execution_id: 'test-id' } });
    const response = httpServerMock.createResponseFactory();

    await handler({}, request, response);

    expect(response.ok).toHaveBeenCalledWith({
      body: expect.objectContaining({ generation: null, validation: null }),
    });
  });
});

describe('registerGetExecutionTrackingRoute feature flag', () => {
  it('registers the route with ATTACK_DISCOVERY_API_ACTION_ALL in requiredPrivileges', async () => {
    const { registerGetExecutionTrackingRoute } = await import('./get_execution_tracking');

    const router = httpServiceMock.createRouter();
    const addVersionMock = jest.fn();
    (router.versioned.get as jest.Mock).mockReturnValue({ addVersion: addVersionMock });

    registerGetExecutionTrackingRoute(router, {} as never, {
      getEventLogIndex: jest.fn().mockResolvedValue('.kibana-event-log-test'),
      getStartServices: jest.fn().mockResolvedValue({ coreStart: {}, pluginsStart: {} }),
    });

    expect(router.versioned.get).toHaveBeenCalledWith(
      expect.objectContaining({
        security: expect.objectContaining({
          authz: expect.objectContaining({
            requiredPrivileges: expect.arrayContaining(['securitySolution-attackDiscoveryAll']),
          }),
        }),
      })
    );
  });

  it('registers the route with ALERTS_API_READ in requiredPrivileges', async () => {
    const { registerGetExecutionTrackingRoute } = await import('./get_execution_tracking');

    const router = httpServiceMock.createRouter();
    const addVersionMock = jest.fn();
    (router.versioned.get as jest.Mock).mockReturnValue({ addVersion: addVersionMock });

    registerGetExecutionTrackingRoute(router, {} as never, {
      getEventLogIndex: jest.fn().mockResolvedValue('.kibana-event-log-test'),
      getStartServices: jest.fn().mockResolvedValue({ coreStart: {}, pluginsStart: {} }),
    });

    expect(router.versioned.get).toHaveBeenCalledWith(
      expect.objectContaining({
        security: expect.objectContaining({
          authz: expect.objectContaining({
            requiredPrivileges: expect.arrayContaining(['alerts-read']),
          }),
        }),
      })
    );
  });

  it('registers the route with the workflows read privilege in requiredPrivileges', async () => {
    const { registerGetExecutionTrackingRoute } = await import('./get_execution_tracking');

    const router = httpServiceMock.createRouter();
    const addVersionMock = jest.fn();
    (router.versioned.get as jest.Mock).mockReturnValue({ addVersion: addVersionMock });

    registerGetExecutionTrackingRoute(router, {} as never, {
      getEventLogIndex: jest.fn().mockResolvedValue('.kibana-event-log-test'),
      getStartServices: jest.fn().mockResolvedValue({ coreStart: {}, pluginsStart: {} }),
    });

    expect(router.versioned.get).toHaveBeenCalledWith(
      expect.objectContaining({
        security: expect.objectContaining({
          authz: expect.objectContaining({
            requiredPrivileges: expect.arrayContaining(['workflowsManagement:read']),
          }),
        }),
      })
    );
  });

  it('returns 404 when the feature flag is disabled', async () => {
    const mockNotFoundResponse = { statusCode: 404 };
    (assertWorkflowsEnabled as jest.Mock).mockResolvedValueOnce(mockNotFoundResponse);

    const { registerGetExecutionTrackingRoute } = await import('./get_execution_tracking');

    const router = httpServiceMock.createRouter();
    const addVersionMock = jest.fn();
    (router.versioned.get as jest.Mock).mockReturnValue({ addVersion: addVersionMock });

    registerGetExecutionTrackingRoute(router, {} as never, {
      getEventLogIndex: jest.fn().mockResolvedValue('.kibana-event-log-test'),
      getStartServices: jest.fn().mockResolvedValue({ coreStart: {}, pluginsStart: {} }),
    });

    const handler = addVersionMock.mock.calls[0][1];
    const request = httpServerMock.createKibanaRequest({ params: { execution_id: 'test-id' } });
    const response = httpServerMock.createResponseFactory();

    const result = await handler({}, request, response);

    expect(result).toEqual(mockNotFoundResponse);
    expect(response.ok).not.toHaveBeenCalled();
  });
});
