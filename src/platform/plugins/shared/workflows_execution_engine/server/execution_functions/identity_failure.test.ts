/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type AnalyticsClient, createAnalytics } from '@elastic/ebt/client';
import Boom from '@hapi/boom';
import { loggerMock } from '@kbn/logging-mocks';
import { usageApiPluginMock } from '@kbn/usage-api-plugin/server/mocks';
import { ExecutionStatus } from '@kbn/workflows';
import type { EsWorkflowExecution, EsWorkflowStepExecution } from '@kbn/workflows';
import { getEventChainContext } from '@kbn/workflows-extensions/server';
import { mockContextDependencies } from './__mock__/context_dependencies';
import {
  createFakeKibanaRequest,
  createMockLogger,
  createMockStepExecutionRepository,
  createMockWorkflowExecutionEngineConfig,
} from './execution_functions_test_utils';
import { resumeWorkflow } from './resume_workflow';
import { runWorkflow } from './run_workflow';
import { setupDependencies } from './setup_dependencies';
import { drainConcurrencyQueueSlots } from '../concurrency/concurrency_queue_drainer';
import { WorkflowExecutionTelemetryEventTypes } from '../lib/telemetry/events/workflows_execution/types';
import { WorkflowExecutionTelemetryClient } from '../lib/telemetry/workflow_execution_telemetry_client';
import { WorkflowsMeteringService } from '../metering';
import { workflowsExecutionEngineMock } from '../mocks';
import { isBulkUpdaterItem } from '../repositories/data_access_layer';
import {
  createMockGetExecutionsByIdsResponse,
  createMockStepDataClient,
  createMockWorkflowDataClient,
} from '../repositories/data_access_layer/mocks';
import { StepExecutionRepository } from '../repositories/step_execution_repository';
import { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';

jest.mock('./setup_dependencies');
jest.mock('../concurrency/concurrency_queue_drainer');

const setup = () => {
  const dependencies = mockContextDependencies();
  const accounts = dependencies.coreStart.security.serviceAccounts;
  jest.spyOn(accounts, 'isEnabled').mockReturnValue(true);
  jest
    .spyOn(accounts, 'withScopedRequestForWorkload')
    .mockRejectedValue(new Error('Binding changed'));
  let execution: EsWorkflowExecution = {
    id: 'child',
    workflowId: 'workflow',
    spaceId: 'default',
    status: ExecutionStatus.RUNNING,
    isTestRun: false,
    context: { parentWorkflowInvocation: 'sync', parentWorkflowExecutionId: 'parent' },
    yaml: '',
    scopeStack: [],
    createdAt: '2026-09-22T00:00:00Z',
    startedAt: '2026-09-22T00:00:00Z',
    finishedAt: '',
    error: null,
    cancelRequested: false,
    duration: 0,
    concurrencyGroupKey: 'group',
    workflowDefinition: {
      version: '1',
      name: 'Bound child',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [],
      settings: { run_as: 'account-a', concurrency: { strategy: 'queue', max: 1 } },
    },
  };
  let seqNo = 1;
  const dataClient = createMockWorkflowDataClient();
  dataClient.getByIds.mockImplementation(async () => ({
    items: [{ document: execution, index: '.workflows-executions', seqNo, primaryTerm: 1 }],
    missing: [],
  }));
  dataClient.bulk.mockImplementation(async ({ items }) => {
    const item = items[0];
    if (isBulkUpdaterItem(item) || item.seqNo !== seqNo) {
      return {
        errors: true,
        items: [
          {
            id: 'child',
            index: '.workflows-executions',
            error: { type: 'version_conflict_engine_exception' },
          },
        ],
      };
    }
    execution = { ...execution, ...item.document };
    seqNo++;
    return { errors: false, items: [{ id: 'child', index: '.workflows-executions' }] };
  });
  const repository = new WorkflowExecutionRepository(dataClient);
  jest.spyOn(repository, 'tryUpdateWorkflowExecutionWithVersion');
  jest.spyOn(repository, 'getWorkflowExecutionById').mockImplementation(async () => execution);
  jest.spyOn(repository, 'updateWorkflowExecution').mockImplementation(async (update) => {
    execution = { ...execution, ...update };
    seqNo++;
  });
  const meteringService = new WorkflowsMeteringService(
    usageApiPluginMock.createSetupContract().usageReporting,
    createMockLogger()
  );
  jest.spyOn(meteringService, 'reportWorkflowExecution').mockResolvedValue(undefined);
  return {
    accounts,
    dataClient,
    setTestRun: () => {
      execution.isTestRun = true;
    },
    setStatus: (status: ExecutionStatus) => {
      execution.status = status;
    },
    params: {
      workflowRunId: 'child',
      spaceId: 'default',
      signal: new AbortController().signal,
      logger: createMockLogger(),
      config: createMockWorkflowExecutionEngineConfig(),
      fakeRequest: createFakeKibanaRequest(),
      dependencies,
      workflowsExecutionEngine: workflowsExecutionEngineMock.createStart(),
      internalResumeWorkflowExecution: jest.fn().mockResolvedValue(undefined),
      meteringService,
      workflowExecutionRepository: repository,
      stepExecutionRepository: createMockStepExecutionRepository(),
    },
  };
};

describe.each([
  ['run', runWorkflow],
  ['resume', resumeWorkflow],
] as const)('%s identity failure', (_name, execute) => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(drainConcurrencyQueueSlots).mockReset();
  });

  it('finalizes the execution and immediately wakes its parent, drains the queue and reports metering', async () => {
    const { params } = setup();
    await expect(execute(params)).rejects.toThrow('Binding changed');
    expect(params.stepExecutionRepository.markNonTerminalStepsFailed).toHaveBeenCalledWith(
      'child',
      expect.objectContaining({ type: 'ServiceAccountExecutionError' }),
      undefined
    );
    expect(params.internalResumeWorkflowExecution).toHaveBeenCalledWith(
      'parent',
      'default',
      undefined
    );
    expect(drainConcurrencyQueueSlots).toHaveBeenCalledWith(
      expect.objectContaining({ concurrencyGroupKey: 'group' })
    );
    expect(params.meteringService.reportWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: ExecutionStatus.FAILED, finishedAt: expect.any(String) }),
      params.dependencies.cloudSetup
    );
    expect(setupDependencies).not.toHaveBeenCalled();
  });

  it('finalizes a waiting step that has not been refreshed before publishing failure', async () => {
    const { params } = setup();
    const step: EsWorkflowStepExecution = {
      id: 'unrefreshed-approval',
      stepId: 'approval',
      workflowRunId: 'child',
      workflowId: 'workflow',
      spaceId: 'default',
      status: ExecutionStatus.WAITING_FOR_INPUT,
    } as EsWorkflowStepExecution;
    await params.workflowExecutionRepository.updateWorkflowExecution({
      id: 'child',
      stepExecutionIds: [step.id],
    });
    const stepClient = createMockStepDataClient();
    stepClient.search.mockResolvedValue({ hits: { hits: [] } } as never);
    stepClient.getByIds.mockResolvedValue(createMockGetExecutionsByIdsResponse([step]));
    stepClient.bulk.mockImplementation(async ({ items }) => {
      expect(
        params.workflowExecutionRepository.tryUpdateWorkflowExecutionWithVersion
      ).not.toHaveBeenCalled();
      Object.assign(step, items[0].document);
      return { errors: false, items: [{ id: step.id, index: '.workflows-step-executions' }] };
    });

    await expect(
      execute({
        ...params,
        stepExecutionRepository: new StepExecutionRepository(stepClient),
      })
    ).rejects.toThrow('Binding changed');

    expect(step.status).toBe(ExecutionStatus.FAILED);
    expect(step.finishedAt).toEqual(expect.any(String));
    expect(stepClient.getByIds).toHaveBeenCalledWith([step.id], expect.any(Object));
    expect(stepClient.search).not.toHaveBeenCalled();
    expect(
      await params.workflowExecutionRepository.getWorkflowExecutionById('child', 'default')
    ).toMatchObject({ status: ExecutionStatus.FAILED });
  });

  it.each([
    'before cleanup',
    'during step write',
    'terminal during step write',
    'terminal after last conflict',
  ] as const)('cancels waiting steps when cancellation wins %s', async (when) => {
    const { params, accounts } = setup();
    const approval = {
      id: 'approval-execution',
      stepId: 'approval',
      workflowRunId: 'child',
      status: ExecutionStatus.WAITING_FOR_INPUT,
    } as EsWorkflowStepExecution;
    const completed = {
      ...approval,
      id: 'completed-step',
      status: ExecutionStatus.COMPLETED,
    };
    const failed = {
      ...approval,
      id: 'failed-step',
      status: ExecutionStatus.FAILED,
      error: { type: 'ConnectorError', message: 'Earlier failure' },
    };
    const steps = [approval, completed, failed];
    const originalTerminalSteps = structuredClone([completed, failed]);
    await params.workflowExecutionRepository.updateWorkflowExecution({
      id: 'child',
      stepExecutionIds: steps.map(({ id }) => id),
    });
    const cancel = async () =>
      params.workflowExecutionRepository.updateWorkflowExecution({
        id: 'child',
        cancelRequested: true,
        cancellationReason: 'Cancelled by the user',
        ...(when.startsWith('terminal') ? { status: ExecutionStatus.CANCELLED } : {}),
      });
    const stepClient = createMockStepDataClient();
    stepClient.getByIds.mockImplementation(async () =>
      createMockGetExecutionsByIdsResponse(structuredClone(steps))
    );
    let firstWrite = true;
    stepClient.bulk.mockImplementation(async ({ items }) => {
      if (firstWrite && (when === 'during step write' || when === 'terminal during step write')) {
        firstWrite = false;
        await cancel();
        // The stale failure write lands after cancellation has won.
        approval.status = ExecutionStatus.CANCELLED;
      }
      for (const item of items) {
        if (isBulkUpdaterItem(item)) {
          throw new Error('identity_failure test mock does not apply updater items');
        }
        const { document } = item;
        const step = steps.find(({ id }) => id === document.id);
        if (!step) throw new Error(`Missing test step ${document.id}`);
        Object.assign(step, document);
      }
      return { errors: false, items: [] };
    });
    if (when === 'terminal after last conflict') {
      let conflicts = 0;
      jest
        .mocked(params.workflowExecutionRepository.tryUpdateWorkflowExecutionWithVersion)
        .mockImplementation(async () => {
          if (++conflicts === 3) await cancel();
          return false;
        });
    }
    if (when === 'before cleanup') {
      jest.mocked(accounts.withScopedRequestForWorkload).mockImplementationOnce(async () => {
        await cancel();
        throw new Error('Binding changed');
      });
    }

    await expect(
      execute({ ...params, stepExecutionRepository: new StepExecutionRepository(stepClient) })
    ).rejects.toThrow('Binding changed');

    expect(approval).toMatchObject({
      status: ExecutionStatus.CANCELLED,
      error: { type: 'WorkflowCancelled', message: 'Cancelled by the user' },
      finishedAt: expect.any(String),
    });
    expect([completed, failed]).toEqual(originalTerminalSteps);
    expect(
      await params.workflowExecutionRepository.getWorkflowExecutionById('child', 'default')
    ).toMatchObject({ status: ExecutionStatus.CANCELLED, error: null });
    expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).not.toHaveBeenCalled();
  });

  it('emits a failure event using the original request when minting fails', async () => {
    const { params } = setup();
    await expect(execute(params)).rejects.toThrow('Binding changed');
    expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).toHaveBeenCalledWith({
      triggerId: 'workflows.failed',
      request: params.fakeRequest,
      payload: expect.objectContaining({
        workflow: expect.objectContaining({ id: 'workflow' }),
        execution: expect.objectContaining({ id: 'child' }),
        error: { message: 'Binding changed' },
      }),
    });
    await execute(params);
    expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).toHaveBeenCalledTimes(1);
  });

  it('preserves event-chain limits when failure occurs before runtime setup', async () => {
    const { params } = setup();
    await params.workflowExecutionRepository.updateWorkflowExecution({
      id: 'child',
      context: { event: { eventChainDepth: 3, eventChainVisitedWorkflowIds: ['upstream'] } },
    });
    await expect(execute(params)).rejects.toThrow('Binding changed');
    expect(getEventChainContext(params.fakeRequest)).toEqual({
      depth: 3,
      sourceExecutionId: 'child',
      visitedWorkflowIds: ['upstream', 'workflow'],
    });
  });

  it('still completes cleanup when failure-event dispatch throws', async () => {
    const { params } = setup();
    params.workflowsExecutionEngine.triggerEvents.emitEvent.mockRejectedValue(
      new Error('Dispatch unavailable')
    );
    await expect(execute(params)).rejects.toThrow('Binding changed');
    expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).toHaveBeenCalledTimes(1);
    expect(params.internalResumeWorkflowExecution).toHaveBeenCalledTimes(1);
    expect(drainConcurrencyQueueSlots).toHaveBeenCalledTimes(1);
    expect(params.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Dispatch unavailable')
    );
  });

  it('does not emit identity-failure events for test runs', async () => {
    const { params, setTestRun } = setup();
    setTestRun();
    await expect(execute(params)).rejects.toThrow('Binding changed');
    expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).not.toHaveBeenCalled();
  });

  describe('run telemetry', () => {
    let analytics: AnalyticsClient;

    beforeEach(() => {
      analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
      WorkflowExecutionTelemetryClient.setup(analytics);
      jest.spyOn(analytics, 'reportEvent');
    });

    afterEach(() => {
      analytics.shutdown();
    });

    /** Runs with the dev-mode analytics client, which throws on any payload the schema rejects. */
    const withDevAnalytics = (
      params: Parameters<typeof runWorkflow>[0]
    ): Parameters<typeof runWorkflow>[0] => ({
      ...params,
      dependencies: {
        ...params.dependencies,
        coreStart: { ...params.dependencies.coreStart, analytics },
      },
    });

    /** Telemetry is fired and forgotten after cleanup, so let it settle before asserting. */
    const flushTelemetry = () => new Promise((resolve) => setImmediate(resolve));

    const executeAndFlush = async (params: Parameters<typeof runWorkflow>[0]) => {
      try {
        return await execute(withDevAnalytics(params));
      } finally {
        await flushTelemetry();
      }
    };

    const reportedEvents = () => jest.mocked(analytics.reportEvent).mock.calls;

    const expectSchemaAccepted = (params: ReturnType<typeof setup>['params']) => {
      expect(params.logger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Error reporting event')
      );
      expect(params.logger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('identity-failure telemetry')
      );
    };

    it('reports one failed-run event with the fixed class and the composition fields', async () => {
      const { params } = setup();
      await params.workflowExecutionRepository.updateWorkflowExecution({
        id: 'child',
        triggeredBy: 'workflow-step',
        context: {
          parentDepth: 0,
          parentWorkflowExecutionId: 'parent',
          parentWorkflowId: 'parent-workflow',
          parentWorkflowInvocation: 'sync',
        },
      });

      await expect(executeAndFlush(params)).rejects.toThrow('Binding changed');

      expect(reportedEvents()).toEqual([
        [
          WorkflowExecutionTelemetryEventTypes.WorkflowExecutionFailed,
          expect.objectContaining({
            compositionDepth: 1,
            errorHandled: false,
            errorMessage: 'other_service_account_error',
            errorType: 'ServiceAccountExecutionError',
            executedStepCount: 0,
            parentWorkflowId: 'parent-workflow',
            parentWorkflowInvocation: 'sync',
            triggerType: 'workflow-step',
            workflowExecutionId: 'child',
            workflowId: 'workflow',
          }),
        ],
      ]);
      expectSchemaAccepted(params);
    });

    it.each([
      [
        'service_account_binding_missing',
        () => Boom.notFound('No service account is bound to workload [workflow/workflow].'),
      ],
      [
        'service_account_binding_refused',
        () =>
          Boom.forbidden(
            'The workload binding does not match the expected service account alertzero_secret.'
          ),
      ],
      [
        'service_account_token_exchange_rejected',
        // The security plugin's wrap of a deleted or recreated account's exchange failure.
        () =>
          Object.assign(
            new Error('Error occurred during service account token exchange.', {
              cause: new Error(
                'Service account token exchange failed for [elastic/alertzero_secret].'
              ),
            }),
            { name: 'ServiceAccountTokenExchangeError', retryable: false, retryAfterMs: 0 }
          ),
      ],
      [
        'service_account_token_exchange_unavailable',
        // The security plugin's wrap of an exchange the cluster couldn't serve.
        () =>
          Object.assign(
            new Error('Error occurred during service account token exchange.', {
              cause: new Error(
                'Service account token exchange failed for [elastic/alertzero_secret].'
              ),
            }),
            { name: 'ServiceAccountTokenExchangeError', retryable: true, retryAfterMs: 0 }
          ),
      ],
      [
        'other_service_account_error',
        () => new Error('Service accounts are not enabled for alertzero_secret'),
      ],
    ])('reports the %s reason without the raw message', async (reason, createError) => {
      const { params, accounts } = setup();
      const error = createError();
      jest.mocked(accounts.withScopedRequestForWorkload).mockRejectedValueOnce(error);

      await expect(executeAndFlush(params)).rejects.toThrow(error.message);

      expect(reportedEvents()).toEqual([
        [
          WorkflowExecutionTelemetryEventTypes.WorkflowExecutionFailed,
          expect.objectContaining({
            errorMessage: reason,
            errorType: 'ServiceAccountExecutionError',
          }),
        ],
      ]);
      const reported = JSON.stringify(reportedEvents());
      expect(reported).not.toContain(error.message);
      expect(reported).not.toContain('alertzero_secret');
      expect(
        (await params.workflowExecutionRepository.getWorkflowExecutionById('child', 'default'))
          ?.error
      ).toEqual({ type: 'ServiceAccountExecutionError', message: error.message });
      expectSchemaAccepted(params);
    });

    it('reports the service_accounts_disabled reason when service account execution is off', async () => {
      const { params, accounts } = setup();
      jest.mocked(accounts.isEnabled).mockReturnValue(false);

      await expect(executeAndFlush(params)).rejects.toThrow(
        'Service account execution is disabled.'
      );

      expect(accounts.withScopedRequestForWorkload).not.toHaveBeenCalled();
      expect(reportedEvents()).toEqual([
        [
          WorkflowExecutionTelemetryEventTypes.WorkflowExecutionFailed,
          expect.objectContaining({ errorMessage: 'service_accounts_disabled' }),
        ],
      ]);
      expectSchemaAccepted(params);
    });

    it('reports the stored steps of a run that ran steps before it waited', async () => {
      const { params } = setup();
      const steps: EsWorkflowStepExecution[] = [
        {
          id: 'lookup-execution',
          stepId: 'lookup',
          stepType: 'elasticsearch.search',
          workflowRunId: 'child',
          workflowId: 'workflow',
          spaceId: 'default',
          status: ExecutionStatus.COMPLETED,
          scopeStack: [],
          startedAt: '2026-09-22T00:00:01Z',
          finishedAt: '2026-09-22T00:00:03Z',
          executionTimeMs: 2000,
          topologicalIndex: 0,
          globalExecutionIndex: 0,
          stepExecutionIndex: 0,
        },
        {
          id: 'approval-execution',
          stepId: 'approval',
          stepType: 'waitForInput',
          workflowRunId: 'child',
          workflowId: 'workflow',
          spaceId: 'default',
          status: ExecutionStatus.WAITING_FOR_INPUT,
          scopeStack: [],
          startedAt: '2026-09-22T00:00:04Z',
          topologicalIndex: 1,
          globalExecutionIndex: 1,
          stepExecutionIndex: 0,
        },
      ];
      await params.workflowExecutionRepository.updateWorkflowExecution({
        id: 'child',
        stepExecutionIds: steps.map(({ id }) => id),
      });
      const stepClient = createMockStepDataClient();
      stepClient.getByIds.mockImplementation(async (ids) =>
        createMockGetExecutionsByIdsResponse(steps.filter(({ id }) => ids.includes(id)))
      );
      stepClient.bulk.mockImplementation(async ({ items }) => {
        for (const item of items) {
          if (isBulkUpdaterItem(item)) {
            throw new Error('identity_failure test mock does not apply updater items');
          }
          Object.assign(steps.find(({ id }) => id === item.document.id) ?? {}, item.document);
        }
        return { errors: false, items: [] };
      });

      await expect(
        executeAndFlush({
          ...params,
          stepExecutionRepository: new StepExecutionRepository(stepClient),
        })
      ).rejects.toThrow('Binding changed');

      expect(reportedEvents()).toEqual([
        [
          WorkflowExecutionTelemetryEventTypes.WorkflowExecutionFailed,
          expect.objectContaining({
            // Known issue: the engine's existing heuristic reads a failed step in a failed run as handled.
            errorHandled: true,
            executedStepCount: 2,
            failedStepId: 'approval',
            failedStepType: 'waitForInput',
            stepDurations: [{ duration: 2000, stepId: 'lookup', stepType: 'elasticsearch.search' }],
            successfulStepCount: 1,
            uniqueStepIdsExecuted: 2,
          }),
        ],
      ]);
      expect(stepClient.getByIds).toHaveBeenLastCalledWith(
        ['lookup-execution', 'approval-execution'],
        expect.objectContaining({ sourceIncludes: expect.arrayContaining(['stepId', 'status']) })
      );
      expectSchemaAccepted(params);
    });

    it('still reports, without steps, when reading the stored steps fails', async () => {
      const { params } = setup();
      await params.workflowExecutionRepository.updateWorkflowExecution({
        id: 'child',
        stepExecutionIds: ['lookup-execution'],
      });
      params.stepExecutionRepository.getStepExecutionsByIds.mockRejectedValue(
        new Error('Step index unavailable')
      );

      await expect(executeAndFlush(params)).rejects.toThrow('Binding changed');

      expect(reportedEvents()).toEqual([
        [
          WorkflowExecutionTelemetryEventTypes.WorkflowExecutionFailed,
          expect.objectContaining({ executedStepCount: 0 }),
        ],
      ]);
      expect(params.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Step index unavailable')
      );
    });

    it('reports one cancelled-run event when a cancellation wins', async () => {
      const { params, accounts } = setup();
      jest.mocked(accounts.withScopedRequestForWorkload).mockImplementationOnce(async () => {
        await params.workflowExecutionRepository.updateWorkflowExecution({
          id: 'child',
          cancelRequested: true,
          cancellationReason: 'Cancelled by user',
          cancelledAt: '2026-09-22T00:00:05Z',
          cancelledBy: 'system',
        });
        throw new Error('Binding changed for alertzero_secret');
      });

      await expect(executeAndFlush(params)).rejects.toThrow('Binding changed');

      expect(reportedEvents()).toEqual([
        [
          WorkflowExecutionTelemetryEventTypes.WorkflowExecutionCancelled,
          expect.objectContaining({
            cancellationReason: 'Cancelled by user',
            cancelledAt: '2026-09-22T00:00:05Z',
            workflowExecutionId: 'child',
          }),
        ],
      ]);
      expect(JSON.stringify(reportedEvents())).not.toContain('alertzero_secret');
      expectSchemaAccepted(params);
    });

    it('does not report when the execution was already terminal', async () => {
      const { params } = setup();
      await expect(executeAndFlush(params)).rejects.toThrow('Binding changed');
      await executeAndFlush(params);
      expect(reportedEvents()).toHaveLength(1);
    });

    it('does not report when another invocation finalized the execution first', async () => {
      const { params, accounts, setStatus } = setup();
      jest.mocked(accounts.withScopedRequestForWorkload).mockImplementationOnce(async () => {
        setStatus(ExecutionStatus.FAILED);
        throw new Error('Binding changed');
      });

      await expect(executeAndFlush(params)).rejects.toThrow('Binding changed');

      expect(reportedEvents()).toHaveLength(0);
    });

    it('reports only after the trigger event and the cleanup', async () => {
      const { params } = setup();
      const order: string[] = [];
      params.workflowsExecutionEngine.triggerEvents.emitEvent.mockImplementation(async () => {
        order.push('workflows.failed');
      });
      params.internalResumeWorkflowExecution.mockImplementation(async () => {
        order.push('cleanup');
      });
      jest.mocked(analytics.reportEvent).mockImplementation(() => {
        order.push('telemetry');
      });

      await expect(executeAndFlush(params)).rejects.toThrow('Binding changed');

      expect(order).toEqual(['workflows.failed', 'cleanup', 'telemetry']);
    });

    it('does not wait for telemetry before it rethrows', async () => {
      const { params } = setup();
      await params.workflowExecutionRepository.updateWorkflowExecution({
        id: 'child',
        stepExecutionIds: ['lookup-execution'],
      });
      params.stepExecutionRepository.getStepExecutionsByIds.mockReturnValue(new Promise(() => {}));

      await expect(executeAndFlush(params)).rejects.toThrow('Binding changed');

      expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).toHaveBeenCalledTimes(1);
      expect(params.internalResumeWorkflowExecution).toHaveBeenCalledTimes(1);
      expect(drainConcurrencyQueueSlots).toHaveBeenCalledTimes(1);
      expect(reportedEvents()).toHaveLength(0);
    });

    it('still reports once when cleanup throws', async () => {
      const { params } = setup();
      jest.mocked(drainConcurrencyQueueSlots).mockRejectedValueOnce(new Error('ES unavailable'));

      await expect(executeAndFlush(params)).rejects.toThrow('queue cleanup is still pending');
      await executeAndFlush(params);

      expect(reportedEvents()).toEqual([
        [WorkflowExecutionTelemetryEventTypes.WorkflowExecutionFailed, expect.anything()],
      ]);
    });

    it('does not change failure handling when the telemetry client throws', async () => {
      const { params } = setup();
      const reportSpy = jest
        .spyOn(WorkflowExecutionTelemetryClient.prototype, 'reportWorkflowExecutionTerminated')
        .mockImplementation(() => {
          throw new Error('Telemetry unavailable');
        });

      try {
        await expect(executeAndFlush(params)).rejects.toThrow('Binding changed');
        expect(reportSpy).toHaveBeenCalledTimes(1);
        expect(params.logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('Telemetry unavailable')
        );
        expect(
          (await params.workflowExecutionRepository.getWorkflowExecutionById('child', 'default'))
            ?.status
        ).toBe(ExecutionStatus.FAILED);
        expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).toHaveBeenCalledTimes(1);
        expect(params.internalResumeWorkflowExecution).toHaveBeenCalledTimes(1);
        expect(drainConcurrencyQueueSlots).toHaveBeenCalledTimes(1);
        expect(params.meteringService.reportWorkflowExecution).toHaveBeenCalledTimes(1);
      } finally {
        reportSpy.mockRestore();
      }
    });
  });

  it('retries parent and queue cleanup after a transient post-execution read failure', async () => {
    const { params, accounts } = setup();
    const repository = params.workflowExecutionRepository;
    const execution = await repository.getWorkflowExecutionById('child', 'default');
    jest
      .spyOn(repository, 'getWorkflowExecutionById')
      .mockResolvedValueOnce(execution)
      .mockRejectedValueOnce(new Error('Transient post-execution read failure'));

    await expect(execute(params)).rejects.toThrow('Binding changed');
    expect((await repository.getWorkflowExecutionById('child', 'default'))?.status).toBe(
      ExecutionStatus.FAILED
    );
    expect(params.internalResumeWorkflowExecution).not.toHaveBeenCalled();
    expect(drainConcurrencyQueueSlots).not.toHaveBeenCalled();

    await execute(params);

    expect(accounts.withScopedRequestForWorkload).toHaveBeenCalledTimes(1);
    expect(repository.tryUpdateWorkflowExecutionWithVersion).toHaveBeenCalledTimes(1);
    expect(repository.updateWorkflowExecution).toHaveBeenCalledTimes(1);
    expect({
      parentResumes: params.internalResumeWorkflowExecution.mock.calls,
      queueDrains: jest.mocked(drainConcurrencyQueueSlots).mock.calls,
    }).toEqual({
      parentResumes: [['parent', 'default', undefined]],
      queueDrains: [[expect.objectContaining({ concurrencyGroupKey: 'group' })]],
    });
  });

  it('keeps parent cleanup pending when wake-up and fail-closed recovery fail', async () => {
    const { params, accounts } = setup();
    const repository = params.workflowExecutionRepository;
    const read = jest.mocked(repository.getWorkflowExecutionById).getMockImplementation();
    if (!read) throw new Error('Missing test repository implementation');
    jest.mocked(repository.getWorkflowExecutionById).mockImplementation(async (id, space) => {
      if (id === 'parent') throw new Error('Parent read unavailable');
      return read(id, space);
    });
    params.internalResumeWorkflowExecution.mockRejectedValue(new Error('Wake unavailable'));
    await expect(execute(params)).rejects.toThrow('Parent read unavailable');
    expect((await read('child', 'default'))?.context?.serviceAccountFailureCleanupPending).toBe(
      true
    );
    params.internalResumeWorkflowExecution.mockResolvedValue(undefined);
    await execute(params);
    expect((await read('child', 'default'))?.context?.serviceAccountFailureCleanupPending).toBe(
      false
    );
    expect(accounts.withScopedRequestForWorkload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.CANCELLED,
    ExecutionStatus.SKIPPED,
  ])('does not remint or rewrite a terminal execution (%s)', async (status) => {
    const { params, accounts, setStatus } = setup();
    setStatus(status);
    await execute(params);
    expect(accounts.withScopedRequestForWorkload).not.toHaveBeenCalled();
    expect(params.workflowExecutionRepository.updateWorkflowExecution).not.toHaveBeenCalled();
    expect(params.stepExecutionRepository.markNonTerminalStepsFailed).not.toHaveBeenCalled();
    expect(setupDependencies).not.toHaveBeenCalled();
    expect(params.internalResumeWorkflowExecution).not.toHaveBeenCalled();
    expect(drainConcurrencyQueueSlots).not.toHaveBeenCalled();
    expect(params.meteringService.reportWorkflowExecution).not.toHaveBeenCalled();
  });

  it('does not repeat successful identity-failure cleanup on a later invocation', async () => {
    const { params } = setup();
    await expect(execute(params)).rejects.toThrow('Binding changed');
    await execute(params);
    expect(params.internalResumeWorkflowExecution).toHaveBeenCalledTimes(1);
    expect(drainConcurrencyQueueSlots).toHaveBeenCalledTimes(1);
    expect(params.meteringService.reportWorkflowExecution).toHaveBeenCalledTimes(1);
  });
  it('retries failed queue cleanup and retains the marker until it succeeds', async () => {
    const { params } = setup();
    jest.mocked(drainConcurrencyQueueSlots).mockRejectedValueOnce(new Error('ES unavailable'));
    await expect(execute(params)).rejects.toThrow('queue cleanup is still pending');
    expect(
      (await params.workflowExecutionRepository.getWorkflowExecutionById('child', 'default'))
        ?.context?.serviceAccountFailureCleanupPending
    ).toBe(true);
    await execute(params);
    expect(drainConcurrencyQueueSlots).toHaveBeenCalledTimes(2);
    expect(
      (await params.workflowExecutionRepository.getWorkflowExecutionById('child', 'default'))
        ?.context?.serviceAccountFailureCleanupPending
    ).toBe(false);
  });

  it.each(['during minting', 'during finalization'])(
    'preserves a cancellation committed %s',
    async (when) => {
      const { params, accounts } = setup();
      const cancel = async () =>
        params.workflowExecutionRepository.updateWorkflowExecution({
          id: 'child',
          status: ExecutionStatus.CANCELLED,
          cancelRequested: true,
        });
      if (when === 'during minting') {
        jest.mocked(accounts.withScopedRequestForWorkload).mockImplementationOnce(async () => {
          await cancel();
          throw new Error('Binding changed');
        });
      } else {
        jest
          .mocked(params.stepExecutionRepository.markNonTerminalStepsFailed)
          .mockImplementationOnce(cancel);
      }
      await expect(execute(params)).rejects.toThrow('Binding changed');
      expect(
        (await params.workflowExecutionRepository.getWorkflowExecutionById('child', 'default'))
          ?.status
      ).toBe(ExecutionStatus.CANCELLED);
      expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).not.toHaveBeenCalled();
    }
  );

  it('finalizes a pending cancellation instead of emitting an identity-failure event', async () => {
    const { params, accounts } = setup();
    jest.mocked(accounts.withScopedRequestForWorkload).mockImplementationOnce(async () => {
      await params.workflowExecutionRepository.updateWorkflowExecution({
        id: 'child',
        cancelRequested: true,
      });
      throw new Error('Binding changed');
    });
    await expect(execute(params)).rejects.toThrow('Binding changed');
    expect(
      (await params.workflowExecutionRepository.getWorkflowExecutionById('child', 'default'))
        ?.status
    ).toBe(ExecutionStatus.CANCELLED);
    expect(params.workflowsExecutionEngine.triggerEvents.emitEvent).not.toHaveBeenCalled();
    expect(drainConcurrencyQueueSlots).toHaveBeenCalledTimes(1);
  });
});
