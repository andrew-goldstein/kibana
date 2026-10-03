/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import { createAnalytics } from '@elastic/ebt/client';
import { loggerMock } from '@kbn/logging-mocks';
import { PROPOSALS_TELEMETRY_EVENTS, registerProposalsTelemetryEvents } from '../../telemetry';
import { runTelemetrySnapshot } from './run_telemetry_snapshot';
import { evaluateSnapshotSearch, type SnapshotFixtureDocument } from './test_fixtures';
import type { TelemetrySnapshotDependencies } from './types';

const NOW = new Date('2026-09-28T03:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

const DOCUMENTS: SnapshotFixtureDocument[] = [
  {
    createdAt: new Date(NOW.getTime() - 80 * HOUR_MS).toISOString(),
    expiresAt: new Date(NOW.getTime() - 8 * HOUR_MS).toISOString(),
    spaceId: 'default',
    status: 'pending',
  },
  {
    createdAt: new Date(NOW.getTime() - 30 * HOUR_MS).toISOString(),
    decidedAt: new Date(NOW.getTime() - 26 * HOUR_MS).toISOString(),
    spaceId: 'space-a',
    status: 'executing',
  },
  {
    createdAt: new Date(NOW.getTime() - 30 * HOUR_MS).toISOString(),
    settledBy: 'deadline',
    spaceId: 'space-a',
    status: 'expired',
  },
];

const createDevAnalytics = ({ registered = true }: { registered?: boolean } = {}) => {
  const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
  if (registered) {
    registerProposalsTelemetryEvents(analytics);
  }
  const reportEvent = jest.spyOn(analytics, 'reportEvent');
  return { analytics, reportEvent };
};

const createDependencies = ({
  optedIn = true,
  registered = true,
  telemetry = true,
}: { optedIn?: boolean; registered?: boolean; telemetry?: boolean } = {}) => {
  const { analytics, reportEvent } = createDevAnalytics({ registered });
  const searchSnapshot = jest.fn<
    ReturnType<TelemetrySnapshotDependencies['searchSnapshot']>,
    Parameters<TelemetrySnapshotDependencies['searchSnapshot']>
  >(async (request) => ({ aggregations: evaluateSnapshotSearch(request, DOCUMENTS) }));
  const dependencies: TelemetrySnapshotDependencies = {
    analytics,
    isOptedIn$: telemetry ? new BehaviorSubject(optedIn) : undefined,
    searchSnapshot,
  };
  return { dependencies, reportEvent, searchSnapshot };
};

const run = ({
  dependencies,
  logger = loggerMock.create(),
  now = NOW,
  signal = new AbortController().signal,
  state = {},
}: {
  dependencies: TelemetrySnapshotDependencies;
  logger?: ReturnType<typeof loggerMock.create>;
  now?: Date;
  signal?: AbortSignal;
  state?: { lastSnapshotDay?: string };
}) =>
  runTelemetrySnapshot({
    getDependencies: async () => dependencies,
    logger,
    now,
    signal,
    state,
  });

describe('runTelemetrySnapshot', () => {
  describe('when telemetry is opted out', () => {
    it('does no Elasticsearch work', async () => {
      const { dependencies, searchSnapshot } = createDependencies({ optedIn: false });

      await run({ dependencies });

      expect(searchSnapshot).not.toHaveBeenCalled();
    });

    it('reports nothing', async () => {
      const { dependencies, reportEvent } = createDependencies({ optedIn: false });

      await run({ dependencies });

      expect(reportEvent).not.toHaveBeenCalled();
    });

    it('keeps the task state, so opting in later still reports that day', async () => {
      const { dependencies } = createDependencies({ optedIn: false });

      await expect(
        run({ dependencies, state: { lastSnapshotDay: '2026-09-27' } })
      ).resolves.toEqual({ state: { lastSnapshotDay: '2026-09-27' } });
    });
  });

  it('does no Elasticsearch work without the telemetry plugin', async () => {
    const { dependencies, searchSnapshot } = createDependencies({ telemetry: false });

    await run({ dependencies });

    expect(searchSnapshot).not.toHaveBeenCalled();
  });

  describe('when telemetry is opted in', () => {
    it('passes the run abort signal to the search', async () => {
      const { dependencies, searchSnapshot } = createDependencies();
      const { signal } = new AbortController();

      await run({ dependencies, signal });

      expect(searchSnapshot).toHaveBeenCalledWith(expect.objectContaining({ size: 0 }), { signal });
    });

    it('reports exactly one proposals_snapshot event', async () => {
      const { dependencies, reportEvent } = createDependencies();

      await run({ dependencies });

      expect(reportEvent.mock.calls.map(([eventType]) => eventType)).toEqual([
        PROPOSALS_TELEMETRY_EVENTS.Snapshot,
      ]);
    });

    it('reports a payload the registered schema accepts', async () => {
      const { dependencies, reportEvent } = createDependencies();

      await run({ dependencies });

      expect(reportEvent.mock.results.filter(({ type }) => type === 'throw')).toEqual([]);
    });

    it('reports the cluster-level aggregate for the UTC day', async () => {
      const { dependencies, reportEvent } = createDependencies();

      await run({ dependencies });

      expect(reportEvent).toHaveBeenCalledWith(PROPOSALS_TELEMETRY_EVENTS.Snapshot, {
        executing_by_age: [{ age_bucket: 'le_72h', count: 1 }],
        pending_by_age: [{ age_bucket: 'le_7d', count: 1 }],
        pending_overdue_by_age: [{ age_bucket: 'le_24h', count: 1 }],
        settled: [{ count: 1, reason: 'deadline', status: 'expired' }],
        snapshot_day: '2026-09-28',
        space_count: 2,
      });
    });

    it('records the reported day in the task state', async () => {
      const { dependencies } = createDependencies();

      await expect(
        run({ dependencies, state: { lastSnapshotDay: '2026-09-27' } })
      ).resolves.toEqual({ state: { lastSnapshotDay: '2026-09-28' } });
    });

    it('does not search again on a second run the same UTC day', async () => {
      const { dependencies, searchSnapshot } = createDependencies();

      await run({ dependencies, state: { lastSnapshotDay: '2026-09-28' } });

      expect(searchSnapshot).not.toHaveBeenCalled();
    });

    it('does not report again on a second run the same UTC day', async () => {
      const { dependencies, reportEvent } = createDependencies();
      const first = await run({ dependencies });

      await run({ dependencies, now: new Date('2026-09-28T23:59:59.999Z'), state: first.state });

      expect(reportEvent).toHaveBeenCalledTimes(1);
    });

    it('reports again on the next UTC day', async () => {
      const { dependencies, reportEvent } = createDependencies();
      const first = await run({ dependencies });

      await run({ dependencies, now: new Date('2026-09-29T00:00:00.000Z'), state: first.state });

      expect(reportEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('when the run fails', () => {
    it('logs a failed search as a warning and resolves with the state unchanged', async () => {
      const { dependencies, searchSnapshot } = createDependencies();
      searchSnapshot.mockRejectedValue(new Error('search_phase_execution_exception'));
      const logger = loggerMock.create();

      const result = await run({ dependencies, logger });

      expect({ result, warned: logger.warn.mock.calls.map(([message]) => message) }).toEqual({
        result: { state: {} },
        warned: [expect.stringContaining('search_phase_execution_exception')],
      });
    });

    it('reports nothing after a failed search', async () => {
      const { dependencies, reportEvent, searchSnapshot } = createDependencies();
      searchSnapshot.mockRejectedValue(new Error('search_phase_execution_exception'));

      await run({ dependencies });

      expect(reportEvent).not.toHaveBeenCalled();
    });

    it('resolves when the dependencies cannot be resolved', async () => {
      const logger = loggerMock.create();

      const result = await runTelemetrySnapshot({
        getDependencies: async () => {
          throw new Error('not started');
        },
        logger,
        now: NOW,
        signal: new AbortController().signal,
        state: {},
      });

      expect({ result, warned: logger.warn.mock.calls.length }).toEqual({
        result: { state: {} },
        warned: 1,
      });
    });

    it('does not record the day when the event could not be reported', async () => {
      const { dependencies } = createDependencies({ registered: false });

      await expect(run({ dependencies })).resolves.toEqual({ state: {} });
    });
  });

  describe('when the run is aborted', () => {
    it('reports nothing once the search returns', async () => {
      const controller = new AbortController();
      const { dependencies, reportEvent, searchSnapshot } = createDependencies();
      searchSnapshot.mockImplementation(async (request) => {
        controller.abort();
        return { aggregations: evaluateSnapshotSearch(request, DOCUMENTS) };
      });

      await run({ dependencies, signal: controller.signal });

      expect(reportEvent).not.toHaveBeenCalled();
    });

    it('logs an aborted search at debug level, not as a warning', async () => {
      const controller = new AbortController();
      const { dependencies, searchSnapshot } = createDependencies();
      searchSnapshot.mockImplementation(async () => {
        controller.abort();
        throw new Error('Request aborted');
      });
      const logger = loggerMock.create();

      const result = await run({ dependencies, logger, signal: controller.signal });

      expect({ result, warned: logger.warn.mock.calls.length }).toEqual({
        result: { state: {} },
        warned: 0,
      });
    });
  });
});
