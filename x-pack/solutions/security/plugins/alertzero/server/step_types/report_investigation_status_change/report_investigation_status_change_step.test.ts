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
import { ReportInvestigationStatusChangeStepId } from '../../../common/step_types';
import { ALERTZERO_TELEMETRY_EVENTS, registerAlertZeroTelemetryEvents } from '../../telemetry';
import type { ReportInvestigationStatusChangeStepDeps } from './report_investigation_status_change_step';
import { getReportInvestigationStatusChangeStepDefinition } from './report_investigation_status_change_step';

const FAKE_REQUEST = { fake: true } as never;
const LISTENER_WORKFLOW_ID = 'system-alertzero-investigation-status-listener';
const INVESTIGATION_ID = '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f';
const TRIGGER_ID = 'ai.conversation.updated';

const INSTALLED_STATE = {
  definitionId: LISTENER_WORKFLOW_ID,
  documentVersion: 1,
  spaceId: '*',
  templateValues: null,
  workflowId: LISTENER_WORKFLOW_ID,
};

const CLOSED_INVESTIGATION = {
  metadata: { close_reason: 'false_positive', status: 'closed' },
  template_id: 'investigation',
};

interface ContextOptions {
  abortSignal?: AbortSignal;
  isTestRun?: boolean;
  spaceId?: string;
  triggeredBy?: string;
}

const createContext = (
  input: unknown,
  {
    abortSignal = new AbortController().signal,
    isTestRun = false,
    spaceId = 'default',
    triggeredBy = TRIGGER_ID,
  }: ContextOptions = {}
) =>
  ({
    abortSignal,
    config: {},
    contextManager: {
      getContext: jest.fn().mockReturnValue({
        execution: { id: 'exec-listener', isTestRun, triggeredBy },
        workflow: { id: LISTENER_WORKFLOW_ID, spaceId },
      }),
      getFakeRequest: jest.fn().mockReturnValue(FAKE_REQUEST),
      renderInputTemplate: jest.fn((value) => value),
    },
    input,
    logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
    rawInput: input,
    stepId: 'report_status_change',
    stepType: ReportInvestigationStatusChangeStepId,
  } as unknown as StepHandlerContext<never, never>);

const createManagedWorkflowState = (): jest.Mocked<ManagedWorkflowStateApi> => ({
  getInstalledWorkflowState: jest.fn(async (_workflowId: string, spaceId: string) =>
    spaceId === '*' ? INSTALLED_STATE : null
  ),
  listInstalledWorkflowStates: jest.fn(),
});

const createDeps = (overrides: Partial<ReportInvestigationStatusChangeStepDeps> = {}) => {
  const analytics = coreMock.createSetup().analytics;
  const logger = loggingSystemMock.createLogger();
  const managedWorkflowState = createManagedWorkflowState();
  const readInvestigation = jest.fn().mockResolvedValue(CLOSED_INVESTIGATION);
  const isTelemetryOptedIn = jest.fn().mockResolvedValue(true);
  const deps: ReportInvestigationStatusChangeStepDeps = {
    analytics,
    getManagedWorkflowState: async () => managedWorkflowState,
    isTelemetryOptedIn,
    logger,
    readInvestigation,
    ...overrides,
  };
  return { analytics, deps, isTelemetryOptedIn, logger, managedWorkflowState, readInvestigation };
};

const run = (
  deps: ReportInvestigationStatusChangeStepDeps,
  context: StepHandlerContext<never, never>
) => getReportInvestigationStatusChangeStepDefinition(deps).handler(context);

const INPUT = { investigation_id: INVESTIGATION_ID, source: 'execution' };

/** The skip reasons in the plugin logger's lazy debug or eager warn messages. */
const loggedMessages = (logger: ReturnType<typeof loggingSystemMock.createLogger>): string[] => [
  ...logger.debug.mock.calls.map(([message]) =>
    typeof message === 'function' ? message() : String(message)
  ),
  ...logger.warn.mock.calls.map(([message]) => String(message)),
];

describe('alertzero.reportInvestigationStatusChange step', () => {
  it('registers under the common step id', () => {
    const { deps } = createDeps();

    expect(getReportInvestigationStatusChangeStepDefinition(deps).id).toBe(
      ReportInvestigationStatusChangeStepId
    );
  });

  describe('a status change the listener reports', () => {
    it('reports the status read after the write, its close reason and the writer', async () => {
      const { analytics, deps } = createDeps();

      const result = await run(deps, createContext(INPUT));

      expect({ calls: analytics.reportEvent.mock.calls, result }).toEqual({
        calls: [
          [
            ALERTZERO_TELEMETRY_EVENTS.InvestigationStatusChanged,
            {
              close_reason: 'false_positive',
              investigation_id: INVESTIGATION_ID,
              is_default_space: true,
              status: 'closed',
              writer: 'agent',
            },
          ],
        ],
        result: { output: { reported: true } },
      });
    });

    it('reports a reopen without the stale close reason', async () => {
      const { analytics, deps } = createDeps({
        readInvestigation: jest.fn().mockResolvedValue({
          metadata: { close_reason: 'benign', status: 'open' },
          template_id: 'investigation',
        }),
      });

      await run(deps, createContext({ ...INPUT, source: 'http_api' }, { spaceId: 'soc' }));

      expect(analytics.reportEvent.mock.calls).toEqual([
        [
          ALERTZERO_TELEMETRY_EVENTS.InvestigationStatusChanged,
          {
            investigation_id: INVESTIGATION_ID,
            is_default_space: false,
            status: 'open',
            writer: 'api',
          },
        ],
      ]);
    });

    it('reports a workflow write, including a Worker close, as `workflow`', async () => {
      const { analytics, deps } = createDeps();

      await run(deps, createContext({ ...INPUT, source: 'workflow' }));

      expect(analytics.reportEvent.mock.calls[0][1]).toEqual(
        expect.objectContaining({ writer: 'workflow' })
      );
    });

    it('reads the Investigation as the run', async () => {
      const { deps, readInvestigation } = createDeps();

      await run(deps, createContext(INPUT));

      expect(readInvestigation.mock.calls).toEqual([[FAKE_REQUEST, INVESTIGATION_ID]]);
    });

    it('sends a payload the registered schema accepts in dev mode', async () => {
      const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
      registerAlertZeroTelemetryEvents(analytics);
      const { deps } = createDeps({ analytics });

      const result = await run(deps, createContext(INPUT));

      expect(result).toEqual({ output: { reported: true } });
    });

    it('never writes to the workflow event log', async () => {
      const { deps } = createDeps();
      const context = createContext(INPUT);

      await run(deps, context);

      expect(Object.values(context.logger).flatMap((fn) => (fn as jest.Mock).mock.calls)).toEqual(
        []
      );
    });
  });

  describe('skips, reporting nothing', () => {
    it.each([
      ['a test run', createContext(INPUT, { isTestRun: true }), 'test_run'],
      [
        'a run not started by the conversation updated trigger',
        createContext(INPUT, { triggeredBy: 'manual' }),
        'not_conversation_trigger',
      ],
      ['a server-side write', createContext({ ...INPUT, source: 'server_api' }), 'excluded_source'],
    ])('%s, before any read, including the opt-in', async (_label, context, reason) => {
      const { analytics, deps, isTelemetryOptedIn, logger, readInvestigation } = createDeps();

      const result = await run(deps, context);

      expect({
        logged: loggedMessages(logger),
        optIn: isTelemetryOptedIn.mock.calls.length,
        read: readInvestigation.mock.calls.length,
        reported: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        logged: [expect.stringContaining(`(${reason})`)],
        optIn: 0,
        read: 0,
        reported: 0,
        result: { output: { reported: false } },
      });
    });

    it('an opted-out cluster, before reading anything', async () => {
      const { analytics, deps, logger, managedWorkflowState, readInvestigation } = createDeps({
        isTelemetryOptedIn: jest.fn().mockResolvedValue(false),
      });

      await run(deps, createContext(INPUT));

      expect({
        logged: loggedMessages(logger),
        managedLookups: managedWorkflowState.getInstalledWorkflowState.mock.calls.length,
        read: readInvestigation.mock.calls.length,
        reported: analytics.reportEvent.mock.calls.length,
      }).toEqual({
        logged: [expect.stringContaining('(opted_out)')],
        managedLookups: 0,
        read: 0,
        reported: 0,
      });
    });

    it('a workflow AlertZero does not manage, before reading the Investigation', async () => {
      const managedWorkflowState = createManagedWorkflowState();
      managedWorkflowState.getInstalledWorkflowState.mockResolvedValue(null);
      const { analytics, deps, logger, readInvestigation } = createDeps({
        getManagedWorkflowState: async () => managedWorkflowState,
      });

      await run(deps, createContext(INPUT));

      expect({
        logged: loggedMessages(logger),
        read: readInvestigation.mock.calls.length,
        reported: analytics.reportEvent.mock.calls.length,
      }).toEqual({ logged: [expect.stringContaining('(not_managed)')], read: 0, reported: 0 });
    });

    it.each([
      ['a failed read', jest.fn().mockRejectedValue(new Error('forbidden')), 'read_failed'],
      ['an Investigation the run cannot see', jest.fn().mockResolvedValue(undefined), 'not_found'],
      [
        'a conversation that is not an Investigation',
        jest.fn().mockResolvedValue({ metadata: { status: 'closed' }, template_id: 'escalation' }),
        'not_investigation',
      ],
      [
        'a status outside the template vocabulary',
        jest.fn().mockResolvedValue({
          metadata: { status: 'archived' },
          template_id: 'investigation',
        }),
        'unknown_status',
      ],
    ])('%s', async (_label, readInvestigation, reason) => {
      const { analytics, deps, logger } = createDeps({ readInvestigation });

      const result = await run(deps, createContext(INPUT));

      expect({
        logged: loggedMessages(logger),
        reported: analytics.reportEvent.mock.calls.length,
        result,
      }).toEqual({
        logged: [expect.stringContaining(`(${reason})`)],
        reported: 0,
        result: { output: { reported: false } },
      });
    });

    it.each([
      ['a missing investigation id', { source: 'execution' }],
      ['an investigation id that is not a UUID', { ...INPUT, investigation_id: 'Phishing case' }],
      ['an unknown source', { ...INPUT, source: 'ui' }],
      ['an undeclared field', { ...INPUT, status: 'closed' }],
    ])('%s, at warn level, logging no rendered values', async (_label, input) => {
      const { analytics, deps, logger } = createDeps();

      await run(deps, createContext(input));

      expect({
        reported: analytics.reportEvent.mock.calls.length,
        warn: logger.warn.mock.calls.map(([message]) => message),
      }).toEqual({
        reported: 0,
        warn: [expect.not.stringMatching(/Phishing case|closed'|ui'/)],
      });
      expect(String(logger.warn.mock.calls[0][0])).toContain('(invalid_input)');
    });

    it('an aborted run', async () => {
      const controller = new AbortController();
      controller.abort();
      const { analytics, deps } = createDeps();

      const result = await run(deps, createContext(INPUT, { abortSignal: controller.signal }));

      expect({ reported: analytics.reportEvent.mock.calls.length, result }).toEqual({
        reported: 0,
        result: { output: { reported: false } },
      });
    });
  });

  describe('never throws', () => {
    it('returns `reported: false` when reporting throws', async () => {
      const analytics = coreMock.createSetup().analytics;
      analytics.reportEvent.mockImplementation(() => {
        throw new Error('unregistered');
      });
      const { deps, logger } = createDeps({ analytics });

      const result = await run(deps, createContext(INPUT));

      expect({ result, warn: loggedMessages(logger) }).toEqual({
        result: { output: { reported: false } },
        warn: expect.arrayContaining([expect.stringContaining('(report_error)')]),
      });
    });

    it('returns `reported: false` when the opt-in read throws', async () => {
      const { deps } = createDeps({
        isTelemetryOptedIn: jest.fn().mockRejectedValue(new Error('telemetry down')),
      });

      expect(await run(deps, createContext(INPUT))).toEqual({ output: { reported: false } });
    });
  });
});
