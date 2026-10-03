/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAnalytics } from '@elastic/ebt/client';
import type {
  ConversationLifecycleChanges,
  ConversationLifecycleCreatedEvent,
  ConversationLifecycleSource,
} from '@kbn/agent-builder-server';
import { loggerMock } from '@kbn/logging-mocks';
import type {
  ManagedWorkflowInstanceState,
  ManagedWorkflowStateApi,
} from '@kbn/workflows/server/types';
import type { AlertZeroTelemetryReporter } from '../telemetry';
import {
  ALERTZERO_TELEMETRY_EVENTS,
  createAlertZeroTelemetryReporter,
  registerAlertZeroTelemetryEvents,
} from '../telemetry';
import type { CreateInvestigationLifecycleListenersParams } from './create_investigation_lifecycle_listeners';
import { createInvestigationLifecycleListeners } from './create_investigation_lifecycle_listeners';

const WORKER_ID = 'system-security-floor-attack-discovery';

const INSTALLED: ManagedWorkflowInstanceState = {
  definitionId: WORKER_ID,
  documentVersion: 1,
  spaceId: 'default',
  templateValues: null,
  workflowId: WORKER_ID,
};

const WORKFLOW_SOURCE: ConversationLifecycleSource = {
  isTestRun: false,
  type: 'workflow',
  workflowExecutionId: 'exec-1',
  workflowId: WORKER_ID,
};

const CLOSE: ConversationLifecycleChanges = {
  close_reason: { next: 'false_positive' },
  status: { next: 'closed', previous: 'open' },
};

const REOPEN: ConversationLifecycleChanges = { status: { next: 'open', previous: 'closed' } };

const createEvent = (
  source: ConversationLifecycleSource,
  changes: ConversationLifecycleChanges = { status: { next: 'open' } },
  conversationId = 'conv-1'
): ConversationLifecycleCreatedEvent => ({
  changes,
  conversationId,
  source,
  spaceId: 'default',
  templateId: 'investigation',
  templateVersion: 1,
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const createManagedWorkflowState = (
  getInstalledWorkflowState: ManagedWorkflowStateApi['getInstalledWorkflowState'] = async () =>
    INSTALLED
): ManagedWorkflowStateApi => ({
  getInstalledWorkflowState: jest.fn(getInstalledWorkflowState),
  listInstalledWorkflowStates: jest.fn(),
});

/** Delivery runs on promise chains and timers resolve lookups, so wait past both. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const setup = (overrides: Partial<CreateInvestigationLifecycleListenersParams> = {}) => {
  const logger = loggerMock.create();
  const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
  registerAlertZeroTelemetryEvents(analytics);
  const reportEvent = jest.spyOn(analytics, 'reportEvent');
  const managedWorkflowState = createManagedWorkflowState();
  const listeners = createInvestigationLifecycleListeners({
    getManagedWorkflowState: async () => managedWorkflowState,
    logger,
    reporter: createAlertZeroTelemetryReporter({ analytics, logger }),
    ...overrides,
  });
  return { listeners, logger, managedWorkflowState, reportEvent };
};

const lazyMessages = ({
  mock: { calls },
}: {
  mock: { calls: ReadonlyArray<readonly unknown[]> };
}) => calls.map(([message]) => (typeof message === 'function' ? message() : message));

const reportedInvestigationIds = (reportEvent: jest.SpyInstance) =>
  reportEvent.mock.calls.map(([, payload]) =>
    payload && typeof payload === 'object' && 'investigation_id' in payload
      ? payload.investigation_id
      : undefined
  );

describe('createInvestigationLifecycleListeners', () => {
  describe('onCreated', () => {
    it.each([
      [{ type: 'http_api' }, 'user'],
      [{ type: 'server_api' }, 'user'],
      [{ type: 'execution' }, 'agent'],
    ] as const)('reports created_by_class for a %j source', async (source, createdByClass) => {
      const { listeners, reportEvent } = setup();

      listeners.onCreated(createEvent(source));
      await flush();

      expect(reportEvent.mock.calls).toEqual([
        [
          ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated,
          {
            created_by_class: createdByClass,
            investigation_id: 'conv-1',
            is_default_space: true,
          },
        ],
      ]);
    });

    it('reports a managed, non-test workflow as a worker with its catalog id', async () => {
      const { listeners, reportEvent } = setup();

      listeners.onCreated(createEvent(WORKFLOW_SOURCE, { severity: { next: 'critical' } }));
      await flush();

      expect(reportEvent.mock.calls).toEqual([
        [
          ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated,
          {
            created_by_class: 'worker',
            investigation_id: 'conv-1',
            is_default_space: true,
            severity: 'critical',
            worker_id: WORKER_ID,
          },
        ],
      ]);
    });

    it('reports a workflow that fails the managed check as a custom workflow', async () => {
      const managedWorkflowState = createManagedWorkflowState(async () => null);
      const { listeners, reportEvent } = setup({
        getManagedWorkflowState: async () => managedWorkflowState,
      });

      listeners.onCreated(createEvent(WORKFLOW_SOURCE));
      await flush();

      expect(reportEvent).toHaveBeenCalledWith(ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated, {
        created_by_class: 'custom_workflow',
        investigation_id: 'conv-1',
        is_default_space: true,
      });
    });

    it('reports a managed workflow test run as a custom workflow', async () => {
      const { listeners, reportEvent } = setup();

      listeners.onCreated(createEvent({ ...WORKFLOW_SOURCE, isTestRun: true }));
      await flush();

      expect(reportEvent).toHaveBeenCalledWith(
        ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated,
        expect.objectContaining({ created_by_class: 'custom_workflow' })
      );
    });

    it('reports a workflow whose lookup outlives the timeout as a custom workflow', async () => {
      const managedWorkflowState = createManagedWorkflowState(() => new Promise(() => {}));
      const { listeners, reportEvent } = setup({
        getManagedWorkflowState: async () => managedWorkflowState,
        lookupTimeoutMs: 1,
      });

      listeners.onCreated(createEvent(WORKFLOW_SOURCE));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(reportEvent).toHaveBeenCalledWith(
        ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated,
        expect.objectContaining({ created_by_class: 'custom_workflow' })
      );
    });

    it('never calls the reporter synchronously', () => {
      const { listeners, reportEvent } = setup();

      listeners.onCreated(createEvent({ type: 'http_api' }));

      expect(reportEvent).not.toHaveBeenCalled();
    });
  });

  describe('onMetadataUpdated', () => {
    it.each([
      [{ type: 'http_api' }, 'user'],
      [{ type: 'execution' }, 'agent'],
      [WORKFLOW_SOURCE, 'worker'],
    ] as const)('reports a close by a %j source', async (source, closedByClass) => {
      const { listeners, reportEvent } = setup();

      listeners.onMetadataUpdated(createEvent(source, CLOSE));
      await flush();

      expect(reportEvent.mock.calls).toEqual([
        [
          ALERTZERO_TELEMETRY_EVENTS.InvestigationClosed,
          {
            close_reason: 'false_positive',
            closed_by_class: closedByClass,
            investigation_id: 'conv-1',
            is_default_space: true,
            ...(closedByClass === 'worker' ? { worker_id: WORKER_ID } : {}),
          },
        ],
      ]);
    });

    it.each([
      [{ type: 'http_api' }, 'user'],
      [{ type: 'execution' }, 'agent'],
      [WORKFLOW_SOURCE, 'worker'],
    ] as const)('reports a reopen by a %j source', async (source, reopenedByClass) => {
      const { listeners, reportEvent } = setup();

      listeners.onMetadataUpdated(createEvent(source, REOPEN));
      await flush();

      expect(reportEvent.mock.calls).toEqual([
        [
          ALERTZERO_TELEMETRY_EVENTS.InvestigationReopened,
          {
            investigation_id: 'conv-1',
            is_default_space: true,
            reopened_by_class: reopenedByClass,
            ...(reopenedByClass === 'worker' ? { worker_id: WORKER_ID } : {}),
          },
        ],
      ]);
    });

    it.each([
      ['close', CLOSE],
      ['reopen', REOPEN],
    ])(
      'skips a %s from a server_api source, which agentic_investigations reports',
      async (_label, changes) => {
        const { listeners, reportEvent } = setup();

        listeners.onMetadataUpdated(createEvent({ type: 'server_api' }, changes));
        await flush();

        expect(reportEvent).not.toHaveBeenCalled();
      }
    );

    it('reports nothing, and looks nothing up, when the status did not transition', async () => {
      const { listeners, managedWorkflowState, reportEvent } = setup();

      listeners.onMetadataUpdated(
        createEvent(WORKFLOW_SOURCE, { severity: { next: 'high', previous: 'low' } })
      );
      await flush();

      expect(reportEvent).not.toHaveBeenCalled();
      expect(managedWorkflowState.getInstalledWorkflowState).not.toHaveBeenCalled();
    });
  });

  describe('hardening', () => {
    it('contains a reporter that throws inside the listener body', async () => {
      const reporter: AlertZeroTelemetryReporter = () => {
        throw new Error('reporter exploded');
      };
      const { listeners, logger } = setup({ reporter });

      expect(() => listeners.onCreated(createEvent({ type: 'http_api' }))).not.toThrow();
      expect(() =>
        listeners.onMetadataUpdated(createEvent({ type: 'http_api' }, CLOSE))
      ).not.toThrow();
      await flush();

      expect(lazyMessages(logger.warn)).toEqual([
        'AlertZero Investigation lifecycle "created" listener failed for conversation "conv-1": reporter exploded',
        'AlertZero Investigation lifecycle "metadata_updated" listener failed for conversation "conv-1": reporter exploded',
      ]);
    });

    it('catches a rejecting managed workflows client and still reports', async () => {
      const { listeners, reportEvent } = setup({
        getManagedWorkflowState: () => Promise.reject(new Error('Workflows unavailable')),
      });

      listeners.onCreated(createEvent(WORKFLOW_SOURCE));
      await flush();

      expect(reportEvent).toHaveBeenCalledWith(
        ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated,
        expect.objectContaining({ created_by_class: 'custom_workflow' })
      );
    });

    it('catches an event it cannot read, without throwing', async () => {
      const { listeners, logger, reportEvent } = setup();
      const malformed = {
        conversationId: 'conv-1',
      } as unknown as ConversationLifecycleCreatedEvent;

      expect(() => listeners.onCreated(malformed)).not.toThrow();
      expect(() => listeners.onMetadataUpdated(malformed)).not.toThrow();
      await flush();

      expect(reportEvent).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('drops work beyond the in-flight bound and logs at debug', async () => {
      const pending = [
        createDeferred<ManagedWorkflowInstanceState | null>(),
        createDeferred<ManagedWorkflowInstanceState | null>(),
      ];
      const managedWorkflowState = createManagedWorkflowState(
        jest
          .fn()
          .mockReturnValueOnce(pending[0].promise)
          .mockReturnValueOnce(pending[1].promise)
          .mockResolvedValue(INSTALLED)
      );
      const { listeners, logger, reportEvent } = setup({
        getManagedWorkflowState: async () => managedWorkflowState,
        maxInFlight: 2,
      });

      listeners.onCreated(createEvent(WORKFLOW_SOURCE, {}, 'conv-1'));
      listeners.onCreated(createEvent(WORKFLOW_SOURCE, {}, 'conv-2'));
      listeners.onCreated(createEvent(WORKFLOW_SOURCE, {}, 'conv-3'));
      await flush();

      expect(lazyMessages(logger.debug)).toContain(
        'Dropped AlertZero Investigation lifecycle "created" event for conversation "conv-3": 2 events already in flight'
      );

      pending.forEach(({ resolve }) => resolve(INSTALLED));
      await flush();

      expect(reportedInvestigationIds(reportEvent)).toEqual(['conv-1', 'conv-2']);

      listeners.onCreated(createEvent(WORKFLOW_SOURCE, {}, 'conv-4'));
      await flush();

      expect(reportedInvestigationIds(reportEvent)).toEqual(['conv-1', 'conv-2', 'conv-4']);
    });

    it('frees an in-flight slot when a listener body fails', async () => {
      const reporter = jest
        .fn<boolean, []>()
        .mockImplementationOnce(() => {
          throw new Error('reporter exploded');
        })
        .mockReturnValue(true);
      const { listeners } = setup({
        maxInFlight: 1,
        reporter: reporter as unknown as AlertZeroTelemetryReporter,
      });

      listeners.onCreated(createEvent({ type: 'http_api' }, {}, 'conv-1'));
      await flush();
      listeners.onCreated(createEvent({ type: 'http_api' }, {}, 'conv-2'));
      await flush();

      expect(reporter).toHaveBeenCalledTimes(2);
    });

    it('emits nothing for an event delivered after stop', async () => {
      const { listeners, reportEvent } = setup();

      listeners.stop();
      listeners.onCreated(createEvent({ type: 'http_api' }));
      listeners.onMetadataUpdated(createEvent({ type: 'http_api' }, CLOSE));
      await flush();

      expect(reportEvent).not.toHaveBeenCalled();
    });

    it('emits nothing for a lookup that resolves after stop', async () => {
      const lookup = createDeferred<ManagedWorkflowInstanceState | null>();
      const managedWorkflowState = createManagedWorkflowState(() => lookup.promise);
      const { listeners, reportEvent } = setup({
        getManagedWorkflowState: async () => managedWorkflowState,
      });

      listeners.onCreated(createEvent(WORKFLOW_SOURCE));
      await flush();
      listeners.stop();
      lookup.resolve(INSTALLED);
      await flush();

      expect(reportEvent).not.toHaveBeenCalled();
    });
  });
});
