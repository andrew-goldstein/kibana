/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAnalytics } from '@elastic/ebt/client';
import { coreMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import type { ManagedWorkflowStateApi } from '@kbn/workflows/server/types';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import { ReportWorkerOutcomeStepId } from '../../../common/step_types';
import { ALERTZERO_TELEMETRY_EVENTS, registerAlertZeroTelemetryEvents } from '../../telemetry';
import type { ReportWorkerOutcomeStepDeps } from './report_worker_outcome_step';
import { getReportWorkerOutcomeStepDefinition } from './report_worker_outcome_step';
import type { WorkerChainExecution } from './worker_chain_execution';
import {
  ENGINE_ROOT,
  REVIEW_EXECUTION_ID,
  ROOT_EXECUTION_ID,
  RUNNER_EXECUTION_ID,
  SPACE_ID,
  createAttackDiscoveryChain,
} from './worker_chain.mock';

const FAKE_REQUEST = { fake: true } as never;
const REVIEW_WORKFLOW_ID = 'system-alertzero-attack-discovery-review';
const INVESTIGATION_ID = '0b9f4a3e-1c2d-8e3f-8a4b-5c6d7e8f9a0b';

const RUN_COMPLETED_INPUT = {
  alerts_analyzed: 120,
  attacks_generated: 4,
  attacks_persisted: 3,
  batches_failed: 0,
  batches_total: 6,
  event: 'ad_worker_run_completed',
  run_outcome: 'produced',
};

const EXPECTED_ENVELOPE = {
  autonomy_level: 'assisted',
  autonomy_mode: 'gated',
  execution_id: REVIEW_EXECUTION_ID,
  is_default_space: true,
  run_id: ROOT_EXECUTION_ID,
  trigger_type: 'scheduled',
  watch_tag: 'watch-floor',
  worker_id: 'system-security-floor-attack-discovery',
};

const INSTALLED_STATE = {
  definitionId: REVIEW_WORKFLOW_ID,
  documentVersion: 1,
  spaceId: '*',
  templateValues: null,
  workflowId: REVIEW_WORKFLOW_ID,
};

interface ContextOptions {
  abortSignal?: AbortSignal;
  isTestRun?: boolean;
  /** The engine-provided root lineage; `null` for a pre-upgrade chain the engine carries none for. */
  root?: { executionId: string; workflowId: string } | null;
}

const createContext = (
  input: unknown,
  {
    abortSignal = new AbortController().signal,
    isTestRun = false,
    root = ENGINE_ROOT,
  }: ContextOptions = {}
) =>
  ({
    abortSignal,
    config: {},
    contextManager: {
      callKibanaApi: jest.fn(),
      getContext: jest.fn().mockReturnValue({
        execution: { id: REVIEW_EXECUTION_ID, isTestRun },
        root: root ?? undefined,
        workflow: { id: REVIEW_WORKFLOW_ID, spaceId: SPACE_ID },
      }),
      getFakeRequest: jest.fn().mockReturnValue(FAKE_REQUEST),
      getScopedEsClient: jest.fn(),
      renderInputTemplate: jest.fn((value) => value),
    },
    input,
    logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
    rawInput: input,
    stepId: 'report_run_completed',
    stepType: ReportWorkerOutcomeStepId,
  } as unknown as StepHandlerContext<never, never>);

const createManagedWorkflowState = (): jest.Mocked<ManagedWorkflowStateApi> => ({
  getInstalledWorkflowState: jest.fn(async (_workflowId: string, spaceId: string) =>
    spaceId === '*' ? INSTALLED_STATE : null
  ),
  listInstalledWorkflowStates: jest.fn(),
});

const createWorkflowsManagement = (
  executions: Record<string, WorkerChainExecution> = createAttackDiscoveryChain()
) => ({
  getWorkflowExecution: jest.fn(async (executionId: string) => executions[executionId] ?? null),
});

const createDeps = (overrides: Partial<ReportWorkerOutcomeStepDeps> = {}) => {
  const analytics = coreMock.createSetup().analytics;
  const logger = loggingSystemMock.createLogger();
  const managedWorkflowState = createManagedWorkflowState();
  const workflowsManagement = createWorkflowsManagement();
  const deps: ReportWorkerOutcomeStepDeps = {
    analytics,
    getManagedWorkflowState: async () => managedWorkflowState,
    getWorkflowsManagement: () => workflowsManagement as never,
    logger,
    ...overrides,
  };
  return { analytics, deps, logger, managedWorkflowState, workflowsManagement };
};

const run = async (deps: ReportWorkerOutcomeStepDeps, context: StepHandlerContext<never, never>) =>
  getReportWorkerOutcomeStepDefinition(deps).handler(context);

/** The skip reason in the plugin logger's lazy debug or eager warn message, if any. */
const loggedMessages = (logger: ReturnType<typeof loggingSystemMock.createLogger>): string[] => [
  ...logger.debug.mock.calls.map(([message]) =>
    typeof message === 'function' ? message() : String(message)
  ),
  ...logger.warn.mock.calls.map(([message]) => String(message)),
];

describe('alertzero.reportWorkerOutcome step', () => {
  it('registers under the common step id', () => {
    const { deps } = createDeps();

    expect(getReportWorkerOutcomeStepDefinition(deps).id).toBe(ReportWorkerOutcomeStepId);
  });

  describe('a managed Worker chain', () => {
    it('reports the outcome with the envelope built from the root', async () => {
      const { analytics, deps } = createDeps();

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        ALERTZERO_TELEMETRY_EVENTS.AdWorkerRunCompleted,
        {
          ...EXPECTED_ENVELOPE,
          alerts_analyzed: 120,
          attacks_generated: 4,
          attacks_persisted: 3,
          batches_failed: 0,
          batches_total: 6,
          run_outcome: 'produced',
        }
      );
    });

    it('returns only `reported: true`', async () => {
      const { deps } = createDeps();

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect(result).toEqual({ output: { reported: true } });
    });

    it('reads only the engine root, without step executions, as the workflow', async () => {
      const { deps, workflowsManagement } = createDeps();

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect(workflowsManagement.getWorkflowExecution.mock.calls).toEqual([
        [ROOT_EXECUTION_ID, SPACE_ID, { omitStepExecutions: true, request: FAKE_REQUEST }],
      ]);
    });

    it('checks the global space when the workflow is not installed in the execution space', async () => {
      const { deps, managedWorkflowState } = createDeps();

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect(managedWorkflowState.getInstalledWorkflowState.mock.calls).toEqual([
        [REVIEW_WORKFLOW_ID, SPACE_ID],
        [REVIEW_WORKFLOW_ID, '*'],
      ]);
    });

    it('reports a Worker installed in the execution space without the global lookup', async () => {
      const managedWorkflowState = createManagedWorkflowState();
      managedWorkflowState.getInstalledWorkflowState.mockResolvedValue(INSTALLED_STATE);
      const { deps } = createDeps({ getManagedWorkflowState: async () => managedWorkflowState });

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect(managedWorkflowState.getInstalledWorkflowState).toHaveBeenCalledTimes(1);
    });

    it('omits an optional field Liquid rendered as the empty string', async () => {
      const { analytics, deps } = createDeps();

      await run(
        deps,
        createContext({
          event: 'ad_worker_review_started',
          investigation_id: '',
          is_rereview: false,
        })
      );

      expect(analytics.reportEvent.mock.calls[0][1]).not.toHaveProperty('investigation_id');
    });

    it('coerces a count Liquid rendered as the empty string to 0', async () => {
      const { analytics, deps } = createDeps();

      await run(deps, createContext({ ...RUN_COMPLETED_INPUT, batches_failed: '' }));

      expect(analytics.reportEvent.mock.calls[0][1]).toEqual(
        expect.objectContaining({ batches_failed: 0 })
      );
    });

    it.each([
      [ALERTZERO_TELEMETRY_EVENTS.AdWorkerRunCompleted, RUN_COMPLETED_INPUT],
      [
        ALERTZERO_TELEMETRY_EVENTS.AdWorkerReviewStarted,
        { event: 'ad_worker_review_started', investigation_id: INVESTIGATION_ID, is_rereview: '' },
      ],
      [
        ALERTZERO_TELEMETRY_EVENTS.AdWorkerAnalysisCompleted,
        { analysis_error: '', event: 'ad_worker_analysis_completed', verdict: 'false_positive' },
      ],
      [
        ALERTZERO_TELEMETRY_EVENTS.AdWorkerHandoffResolved,
        {
          auto_approve_requested: '',
          event: 'ad_worker_handoff_resolved',
          outcome: 'approved',
          verdict: 'true_positive',
        },
      ],
    ])('reports a %s payload the registered schema accepts', async (eventType, input) => {
      const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
      registerAlertZeroTelemetryEvents(analytics);
      const reportEvent = jest.spyOn(analytics, 'reportEvent');
      const { deps } = createDeps({ analytics });

      const result = await run(deps, createContext(input));

      expect({ eventType: reportEvent.mock.calls[0]?.[0], result }).toEqual({
        eventType,
        result: { output: { reported: true } },
      });
    });

    it('never writes to the workflow event log', async () => {
      const { deps } = createDeps();
      const context = createContext(RUN_COMPLETED_INPUT);

      await run(deps, context);

      expect(Object.values(context.logger).flatMap((fn) => (fn as jest.Mock).mock.calls)).toEqual(
        []
      );
    });
  });

  describe('a pre-upgrade chain the engine carries no root for', () => {
    const PRE_UPGRADE = { root: null };

    it('reports the outcome with the envelope built from the walked root', async () => {
      const { analytics, deps } = createDeps();

      await run(deps, createContext(RUN_COMPLETED_INPUT, PRE_UPGRADE));

      expect(analytics.reportEvent).toHaveBeenCalledWith(
        ALERTZERO_TELEMETRY_EVENTS.AdWorkerRunCompleted,
        expect.objectContaining(EXPECTED_ENVELOPE)
      );
    });

    it('walks every execution of the chain without step executions, as the workflow', async () => {
      const { deps, workflowsManagement } = createDeps();

      await run(deps, createContext(RUN_COMPLETED_INPUT, PRE_UPGRADE));

      expect(workflowsManagement.getWorkflowExecution.mock.calls).toEqual(
        [REVIEW_EXECUTION_ID, RUNNER_EXECUTION_ID, ROOT_EXECUTION_ID].map((id) => [
          id,
          SPACE_ID,
          { omitStepExecutions: true, request: FAKE_REQUEST },
        ])
      );
    });

    it('walks the chain when the engine root carries a blank execution id', async () => {
      const { deps, workflowsManagement } = createDeps();

      await run(
        deps,
        createContext(RUN_COMPLETED_INPUT, { root: { executionId: '', workflowId: '' } })
      );

      expect(workflowsManagement.getWorkflowExecution.mock.calls.map(([id]) => id)).toEqual([
        REVIEW_EXECUTION_ID,
        RUNNER_EXECUTION_ID,
        ROOT_EXECUTION_ID,
      ]);
    });

    it('skips a chain with a persisted test-run hop', async () => {
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement({
        ...chain,
        [RUNNER_EXECUTION_ID]: { ...chain[RUNNER_EXECUTION_ID], isTestRun: true },
      });
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      await run(deps, createContext(RUN_COMPLETED_INPUT, PRE_UPGRADE));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
      }).toEqual({ logged: [expect.stringContaining('(test_run)')], reportEvent: 0 });
    });

    it('skips a chain with an unmanaged hop', async () => {
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement({
        ...chain,
        [RUNNER_EXECUTION_ID]: { ...chain[RUNNER_EXECUTION_ID], managed: false, managedBy: null },
      });
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT, PRE_UPGRADE));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        logged: [expect.stringContaining('(not_managed)')],
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });

    it('skips a chain with a parent in another space', async () => {
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement({
        ...chain,
        [RUNNER_EXECUTION_ID]: { ...chain[RUNNER_EXECUTION_ID], spaceId: 'space-b' },
      });
      const { analytics, deps } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT, PRE_UPGRADE));

      expect({ reportEvent: analytics.reportEvent.mock.calls.length, result }).toEqual({
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });

    it('skips a chain whose root is not a catalog Worker', async () => {
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement({
        ...chain,
        [ROOT_EXECUTION_ID]: { ...chain[ROOT_EXECUTION_ID], originManagedWorkflowId: 'custom' },
      });
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      await run(deps, createContext(RUN_COMPLETED_INPUT, PRE_UPGRADE));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
      }).toEqual({ logged: [expect.stringContaining('(not_catalog_root)')], reportEvent: 0 });
    });

    it('skips a chain with a missing ancestor, as lineage_unavailable', async () => {
      const { [RUNNER_EXECUTION_ID]: _missing, ...chain } = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement(chain);
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      await run(deps, createContext(RUN_COMPLETED_INPUT, PRE_UPGRADE));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
      }).toEqual({ logged: [expect.stringContaining('(lineage_unavailable)')], reportEvent: 0 });
    });
  });

  describe('skips', () => {
    it('a test run, before any lookup', async () => {
      const { analytics, deps, logger, managedWorkflowState } = createDeps();

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT, { isTestRun: true }));

      expect({
        getInstalledWorkflowState: managedWorkflowState.getInstalledWorkflowState.mock.calls.length,
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        getInstalledWorkflowState: 0,
        logged: [expect.stringContaining('(test_run)')],
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });

    it('a root persisted as a test run', async () => {
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement({
        ...chain,
        [ROOT_EXECUTION_ID]: { ...chain[ROOT_EXECUTION_ID], isTestRun: true },
      });
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
      }).toEqual({ logged: [expect.stringContaining('(test_run)')], reportEvent: 0 });
    });

    it('a workflow AlertZero does not manage', async () => {
      const managedWorkflowState = createManagedWorkflowState();
      managedWorkflowState.getInstalledWorkflowState.mockResolvedValue(null);
      const { analytics, deps, logger, workflowsManagement } = createDeps({
        getManagedWorkflowState: async () => managedWorkflowState,
      });

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({
        getWorkflowExecution: workflowsManagement.getWorkflowExecution.mock.calls.length,
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
      }).toEqual({
        getWorkflowExecution: 0,
        logged: [expect.stringContaining('(not_managed)')],
        reportEvent: 0,
      });
    });

    it('a root AlertZero does not manage', async () => {
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement({
        ...chain,
        [ROOT_EXECUTION_ID]: { ...chain[ROOT_EXECUTION_ID], managed: false, managedBy: null },
      });
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        logged: [expect.stringContaining('(not_managed)')],
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });

    it('a root in another space', async () => {
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement({
        ...chain,
        [ROOT_EXECUTION_ID]: { ...chain[ROOT_EXECUTION_ID], spaceId: 'space-b' },
      });
      const { analytics, deps } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({ reportEvent: analytics.reportEvent.mock.calls.length, result }).toEqual({
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });

    it('a root that is not a catalog Worker', async () => {
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement({
        ...chain,
        [ROOT_EXECUTION_ID]: { ...chain[ROOT_EXECUTION_ID], originManagedWorkflowId: 'custom' },
      });
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        logged: [expect.stringContaining('(not_catalog_root)')],
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });

    it('a root that cannot be read, as lineage_unavailable at debug level', async () => {
      const { [ROOT_EXECUTION_ID]: _missing, ...chain } = createAttackDiscoveryChain();
      const workflowsManagement = createWorkflowsManagement(chain);
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({
        debug: logger.debug.mock.calls.map(([message]) => (message as () => string)()),
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
        warn: logger.warn.mock.calls.length,
      }).toEqual({
        debug: [expect.stringContaining('(lineage_unavailable)')],
        reportEvent: 0,
        result: { output: { reported: false } },
        warn: 0,
      });
    });

    it('when the managed workflows client is unavailable', async () => {
      const { analytics, deps, logger } = createDeps({
        getManagedWorkflowState: async () => undefined,
      });

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
      }).toEqual({ logged: [expect.stringContaining('(lineage_unavailable)')], reportEvent: 0 });
    });

    it('when the managed state lookup throws', async () => {
      const managedWorkflowState = createManagedWorkflowState();
      managedWorkflowState.getInstalledWorkflowState.mockRejectedValue(
        new Error('Workflows is not available in this environment')
      );
      const { analytics, deps, logger } = createDeps({
        getManagedWorkflowState: async () => managedWorkflowState,
      });

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        logged: [expect.stringContaining('(lineage_unavailable)')],
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });

    it('when the Workflows management API is unavailable', async () => {
      const { analytics, deps, logger } = createDeps({ getWorkflowsManagement: () => undefined });

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
      }).toEqual({ logged: [expect.stringContaining('(lineage_unavailable)')], reportEvent: 0 });
    });

    it('an invalid input at warn level, before any lookup', async () => {
      const { analytics, deps, logger, managedWorkflowState } = createDeps();

      const result = await run(
        deps,
        createContext({ ...RUN_COMPLETED_INPUT, run_outcome: 'skipped_space_disabled' })
      );

      expect({
        getInstalledWorkflowState: managedWorkflowState.getInstalledWorkflowState.mock.calls.length,
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
        warn: logger.warn.mock.calls.map(([message]) => message),
      }).toEqual({
        getInstalledWorkflowState: 0,
        reportEvent: 0,
        result: { output: { reported: false } },
        warn: [expect.stringContaining('(invalid_input)')],
      });
    });

    it('an invalid input without echoing the rendered values', async () => {
      const { deps, logger } = createDeps();

      await run(
        deps,
        createContext({ ...RUN_COMPLETED_INPUT, run_outcome: 'Lateral movement on fin-dc-01' })
      );

      expect(String(logger.warn.mock.calls[0][0])).not.toContain('fin-dc-01');
    });

    it('an already aborted run, before any lookup', async () => {
      const controller = new AbortController();
      controller.abort();
      const { analytics, deps, logger, managedWorkflowState } = createDeps();

      const result = await run(
        deps,
        createContext(RUN_COMPLETED_INPUT, { abortSignal: controller.signal })
      );

      expect({
        getInstalledWorkflowState: managedWorkflowState.getInstalledWorkflowState.mock.calls.length,
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        getInstalledWorkflowState: 0,
        logged: [expect.stringContaining('(aborted)')],
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });

    it('a run aborted during the root read, immediately before reporting', async () => {
      const controller = new AbortController();
      const chain = createAttackDiscoveryChain();
      const workflowsManagement = {
        getWorkflowExecution: jest.fn(async (executionId: string) => {
          if (executionId === ROOT_EXECUTION_ID) {
            controller.abort();
          }
          return chain[executionId] ?? null;
        }),
      };
      const { analytics, deps, logger } = createDeps({
        getWorkflowsManagement: () => workflowsManagement as never,
      });

      const result = await run(
        deps,
        createContext(RUN_COMPLETED_INPUT, { abortSignal: controller.signal })
      );

      expect({
        logged: loggedMessages(logger),
        reportEvent: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        logged: [expect.stringContaining('(aborted)')],
        reportEvent: 0,
        result: { output: { reported: false } },
      });
    });
  });

  describe('a failing analytics client', () => {
    const createThrowingDeps = () => {
      const created = createDeps();
      created.analytics.reportEvent.mockImplementation(() => {
        throw new Error('Attempted to report event type before registering it');
      });
      return created;
    };

    it('still returns cleanly with `reported: false`', async () => {
      const { deps } = createThrowingDeps();

      const result = await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect(result).toEqual({ output: { reported: false } });
    });

    it('logs report_error at warn level', async () => {
      const { deps, logger } = createThrowingDeps();

      await run(deps, createContext(RUN_COMPLETED_INPUT));

      expect(logger.warn.mock.calls.map(([message]) => message)).toEqual([
        expect.stringContaining('(report_error)'),
      ]);
    });
  });

  it('never throws, even when a dependency getter throws', async () => {
    const { deps, logger } = createDeps({
      getWorkflowsManagement: () => {
        throw new Error('unexpected');
      },
    });

    const result = await run(deps, createContext(RUN_COMPLETED_INPUT));

    expect({ logged: loggedMessages(logger), result }).toEqual({
      logged: [expect.stringContaining('(report_error)')],
      result: { output: { reported: false } },
    });
  });
});
