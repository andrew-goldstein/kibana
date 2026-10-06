/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import {
  createProposalsTelemetryReporter,
  PROPOSALS_TELEMETRY_EVENTS,
  readTelemetryOptIn,
  toSnapshotDay,
} from '../../telemetry';
import { buildSnapshotPayload } from './build_snapshot_payload';
import { buildSnapshotSearchRequest } from './build_snapshot_search_request';
import { TELEMETRY_OPT_IN_TIMEOUT_MS } from './constants';
import type { TelemetrySnapshotTaskState } from './state';
import type { TelemetrySnapshotDependencies } from './types';

export interface RunTelemetrySnapshotParams {
  getDependencies: () => Promise<TelemetrySnapshotDependencies>;
  logger: Logger;
  now: Date;
  signal: AbortSignal;
  state: TelemetrySnapshotTaskState;
}

/**
 * Aggregates and reports one day's `proposals_snapshot`. It checks the telemetry opt-in before any
 * Elasticsearch work, reports at most once per UTC day, and never throws: a failed run is logged
 * and the next scheduled run tries again.
 */
export const runTelemetrySnapshot = async ({
  getDependencies,
  logger,
  now,
  signal,
  state,
}: RunTelemetrySnapshotParams): Promise<{ state: TelemetrySnapshotTaskState }> => {
  try {
    const { analytics, isOptedIn$, searchSnapshot } = await getDependencies();

    if (!(await readTelemetryOptIn({ isOptedIn$, timeoutMs: TELEMETRY_OPT_IN_TIMEOUT_MS }))) {
      logger.debug(() => 'Proposals telemetry snapshot skipped: telemetry is opted out');
      return { state };
    }

    const snapshotDay = toSnapshotDay(now);
    if (state.lastSnapshotDay === snapshotDay) {
      logger.debug(() => `Proposals telemetry snapshot already reported for ${snapshotDay}`);
      return { state };
    }

    const { aggregations } = await searchSnapshot(buildSnapshotSearchRequest(now), { signal });
    if (signal.aborted) {
      logger.debug(() => 'Proposals telemetry snapshot aborted before reporting');
      return { state };
    }

    const report = createProposalsTelemetryReporter({ analytics, logger });
    const reported = report(
      PROPOSALS_TELEMETRY_EVENTS.Snapshot,
      buildSnapshotPayload({ aggregations, snapshotDay })
    );

    // An unreported day stays unrecorded, so a later run that day can still send it.
    return reported ? { state: { ...state, lastSnapshotDay: snapshotDay } } : { state };
  } catch (error) {
    if (signal.aborted) {
      logger.debug(() => 'Proposals telemetry snapshot aborted');
      return { state };
    }
    logger.warn(
      `Proposals telemetry snapshot failed; the next scheduled run tries again: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { state };
  }
};
