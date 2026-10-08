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
import { coreMock } from '@kbn/core/server/mocks';
import type { MockedLogger } from '@kbn/logging-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import type { EsWorkflowExecution, EsWorkflowStepExecution } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowYaml } from '@kbn/workflows/spec/schema';
import {
  MAX_IDENTITY_FAILURE_STEP_EXECUTIONS,
  reportWorkflowIdentityFailureTelemetry,
} from './report_workflow_identity_failure_telemetry';
import { WorkflowExecutionTelemetryEventTypes } from './telemetry/events/workflows_execution/types';
import { WorkflowExecutionTelemetryClient } from './telemetry/workflow_execution_telemetry_client';
import type { StepExecutionRepository } from '../repositories/step_execution_repository';

const RAW_ERROR_MESSAGE =
  'The workload binding does not match the expected service account alertzero_secret_worker.';

const createExecution = (overrides: Partial<EsWorkflowExecution> = {}): EsWorkflowExecution => ({
  cancelRequested: false,
  context: {
    parentDepth: 0,
    parentWorkflowExecutionId: 'parent-exec-id',
    parentWorkflowId: 'parent-wf-id',
    parentWorkflowInvocation: 'sync',
    serviceAccountFailureCleanupPending: true,
  },
  createdAt: '2026-10-08T00:00:00.000Z',
  duration: 0,
  error: { message: RAW_ERROR_MESSAGE, type: 'ServiceAccountExecutionError' },
  finishedAt: '2026-10-08T00:10:00.000Z',
  id: 'child-exec-id',
  isTestRun: false,
  managed: true,
  originManagedWorkflowId: 'alertzero-floor-worker',
  scopeStack: [],
  spaceId: 'default',
  startedAt: '2026-10-08T00:00:00.000Z',
  status: ExecutionStatus.FAILED,
  stepExecutionIds: ['lookup-execution', 'approval-execution'],
  triggeredBy: 'workflow-step',
  workflowDefinition: {
    settings: { run_as: 'alertzero_secret_worker' },
    steps: [],
  } as Partial<WorkflowYaml> as WorkflowYaml,
  workflowId: 'child-wf-id',
  yaml: '',
  ...overrides,
});

const storedStepBase = {
  spaceId: 'default',
  stepExecutionIndex: 0,
  workflowId: 'child-wf-id',
  workflowRunId: 'child-exec-id',
};

const storedSteps: EsWorkflowStepExecution[] = [
  {
    ...storedStepBase,
    executionTimeMs: 2000,
    finishedAt: '2026-10-08T00:00:03.000Z',
    id: 'lookup-execution',
    scopeStack: [],
    startedAt: '2026-10-08T00:00:01.000Z',
    status: ExecutionStatus.COMPLETED,
    stepId: 'lookup',
    stepType: 'elasticsearch.search',
    globalExecutionIndex: 0,
    topologicalIndex: 0,
  },
  {
    ...storedStepBase,
    finishedAt: '2026-10-08T00:10:00.000Z',
    id: 'approval-execution',
    scopeStack: [],
    startedAt: '2026-10-08T00:00:04.000Z',
    status: ExecutionStatus.FAILED,
    stepId: 'approval',
    stepType: 'waitForInput',
    globalExecutionIndex: 1,
    topologicalIndex: 1,
  },
];

describe('reportWorkflowIdentityFailureTelemetry', () => {
  let analytics: AnalyticsClient;
  let core: ReturnType<typeof coreMock.createStart>;
  let logger: MockedLogger;
  let stepExecutionRepository: jest.Mocked<Pick<StepExecutionRepository, 'getStepExecutionsByIds'>>;

  const report = (
    execution: EsWorkflowExecution,
    error: unknown = Boom.forbidden(RAW_ERROR_MESSAGE)
  ) =>
    reportWorkflowIdentityFailureTelemetry({
      core: { ...core, analytics },
      error,
      execution,
      logger,
      stepExecutionRepository: stepExecutionRepository as unknown as StepExecutionRepository,
    });

  const reportedEvents = () => jest.mocked(analytics.reportEvent).mock.calls;

  beforeEach(() => {
    analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
    WorkflowExecutionTelemetryClient.setup(analytics);
    jest.spyOn(analytics, 'reportEvent');
    core = coreMock.createStart();
    jest.mocked(core.security.serviceAccounts.isEnabled).mockReturnValue(true);
    logger = loggerMock.create();
    stepExecutionRepository = {
      getStepExecutionsByIds: jest.fn().mockResolvedValue(storedSteps),
    };
  });

  afterEach(async () => {
    await analytics.shutdown();
  });

  it('reports a failed run with a fixed reason and its stored steps, accepted by the schema', async () => {
    await report(createExecution());

    expect(reportedEvents()).toEqual([
      [
        WorkflowExecutionTelemetryEventTypes.WorkflowExecutionFailed,
        expect.objectContaining({
          compositionDepth: 1,
          duration: 600000,
          // Known issue: the engine's existing heuristic reads a failed step in a failed run as handled.
          errorHandled: true,
          errorMessage: 'service_account_binding_refused',
          errorType: 'ServiceAccountExecutionError',
          executedStepCount: 2,
          failedAt: '2026-10-08T00:10:00.000Z',
          failedStepId: 'approval',
          failedStepType: 'waitForInput',
          isManaged: true,
          originManagedWorkflowId: 'alertzero-floor-worker',
          parentWorkflowId: 'parent-wf-id',
          parentWorkflowInvocation: 'sync',
          stepDurations: [{ duration: 2000, stepId: 'lookup', stepType: 'elasticsearch.search' }],
          successfulStepCount: 1,
          triggerType: 'workflow-step',
          uniqueStepIdsExecuted: 2,
          workflowExecutionId: 'child-exec-id',
        }),
      ],
    ]);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('never sends the stored error message or the service account name', async () => {
    await report(createExecution());

    const reported = JSON.stringify(reportedEvents());
    expect(reported).not.toContain(RAW_ERROR_MESSAGE);
    expect(reported).not.toContain('alertzero_secret_worker');
  });

  it('reports a cancelled run when a cancellation won, accepted by the schema', async () => {
    await report(
      createExecution({
        cancellationReason: 'Cancelled by user',
        cancelledAt: '2026-10-08T00:05:00.000Z',
        cancelledBy: 'system',
        cancelRequested: true,
        error: null,
        status: ExecutionStatus.CANCELLED,
      })
    );

    expect(reportedEvents()).toEqual([
      [
        WorkflowExecutionTelemetryEventTypes.WorkflowExecutionCancelled,
        expect.objectContaining({
          cancellationReason: 'Cancelled by user',
          cancelledAt: '2026-10-08T00:05:00.000Z',
          cancelledBy: 'system',
          duration: 300000,
          executedStepCount: 2,
          workflowExecutionId: 'child-exec-id',
        }),
      ],
    ]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([ExecutionStatus.RUNNING, ExecutionStatus.COMPLETED, ExecutionStatus.SKIPPED])(
    'reports nothing for a %s execution',
    async (status) => {
      await report(createExecution({ status }));

      expect(reportedEvents()).toHaveLength(0);
      expect(stepExecutionRepository.getStepExecutionsByIds).not.toHaveBeenCalled();
    }
  );

  it('classifies a run as disabled when service account execution is off', async () => {
    jest.mocked(core.security.serviceAccounts.isEnabled).mockReturnValue(false);

    await report(createExecution(), Boom.forbidden('Service account execution is disabled.'));

    expect(reportedEvents()[0][1]).toEqual(
      expect.objectContaining({ errorMessage: 'service_accounts_disabled' })
    );
  });

  it('reads at most a bounded number of stored steps, and only the fields telemetry uses', async () => {
    const stepExecutionIds = Array.from(
      { length: MAX_IDENTITY_FAILURE_STEP_EXECUTIONS + 5 },
      (_, index) => `step-${index}`
    );

    await report(createExecution({ stepExecutionIds }));

    const [ids, sourceIncludes] = stepExecutionRepository.getStepExecutionsByIds.mock.calls[0];
    expect(ids).toHaveLength(MAX_IDENTITY_FAILURE_STEP_EXECUTIONS);
    expect(sourceIncludes).not.toContain('input');
    expect(sourceIncludes).not.toContain('output');
  });

  it('keeps the newest steps when it caps the read, so the waiting step is included', async () => {
    const stepExecutionIds = [
      ...Array.from(
        { length: MAX_IDENTITY_FAILURE_STEP_EXECUTIONS + 5 },
        (_, index) => `step-${index}`
      ),
      'approval-execution',
    ];

    await report(createExecution({ stepExecutionIds }));

    const [ids] = stepExecutionRepository.getStepExecutionsByIds.mock.calls[0];
    expect(ids).toHaveLength(MAX_IDENTITY_FAILURE_STEP_EXECUTIONS);
    expect(ids[ids.length - 1]).toBe('approval-execution');
    expect(ids).not.toContain('step-0');
    expect(ids[0]).toBe('step-6');
  });

  it('does not read steps for a run that has none', async () => {
    await report(createExecution({ stepExecutionIds: [] }));

    expect(stepExecutionRepository.getStepExecutionsByIds).not.toHaveBeenCalled();
    expect(reportedEvents()[0][1]).toEqual(expect.objectContaining({ executedStepCount: 0 }));
  });

  it('still reports, without steps, when the step read fails', async () => {
    stepExecutionRepository.getStepExecutionsByIds.mockRejectedValue(new Error('Index closed'));

    await report(createExecution());

    expect(reportedEvents()[0][1]).toEqual(expect.objectContaining({ executedStepCount: 0 }));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Index closed'));
  });

  it('logs at debug level and resolves when the telemetry client throws', async () => {
    const reportSpy = jest
      .spyOn(WorkflowExecutionTelemetryClient.prototype, 'reportWorkflowExecutionTerminated')
      .mockImplementation(() => {
        throw new Error('Telemetry unavailable');
      });

    try {
      await expect(report(createExecution())).resolves.toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Telemetry unavailable'));
    } finally {
      reportSpy.mockRestore();
    }
  });
});
