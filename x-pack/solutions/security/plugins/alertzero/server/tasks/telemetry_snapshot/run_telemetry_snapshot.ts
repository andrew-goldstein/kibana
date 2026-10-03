/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import {
  ALERTZERO_TELEMETRY_EVENTS,
  buildAutonomySnapshotPayload,
  buildFeatureFlagsSnapshotPayload,
  createAlertZeroTelemetryReporter,
  readTelemetryOptIn,
  toSnapshotDay,
} from '../../telemetry';
import { collectSpaceSnapshot } from './collect_space_snapshot';
import { collectSpaceSnapshots } from './collect_space_snapshots';
import { SNAPSHOT_SPACE_CONCURRENCY, TELEMETRY_OPT_IN_TIMEOUT_MS } from './constants';
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
 * Reads, sums and reports one day's autonomy and feature flags snapshots. It checks the
 * telemetry opt-in before any Elasticsearch work, reports at most once per UTC day, and never
 * throws: a failed run is logged and the next scheduled run tries again.
 */
export const runTelemetrySnapshot = async ({
  getDependencies,
  logger,
  now,
  signal,
  state,
}: RunTelemetrySnapshotParams): Promise<{ state: TelemetrySnapshotTaskState }> => {
  try {
    const {
      analytics,
      getAttackDiscoveryWorkflowsEnabled,
      getManagedWorkflows,
      getUiSettingsClient,
      isOptedIn$,
      listSpaceIds,
    } = await getDependencies();

    if (!(await readTelemetryOptIn({ isOptedIn$, timeoutMs: TELEMETRY_OPT_IN_TIMEOUT_MS }))) {
      logger.debug(() => 'AlertZero telemetry snapshot skipped: telemetry is opted out');
      return { state };
    }

    const snapshotDay = toSnapshotDay(now);
    if (state.lastSnapshotDay === snapshotDay) {
      logger.debug(() => `AlertZero telemetry snapshot already reported for ${snapshotDay}`);
      return { state };
    }

    const managedWorkflows = await getManagedWorkflows();
    if (!managedWorkflows) {
      logger.debug(() => 'AlertZero telemetry snapshot skipped: managed workflows are unavailable');
      return { state };
    }

    const [spaceIds, attackDiscoveryWorkflowsEnabled] = await Promise.all([
      listSpaceIds(signal),
      getAttackDiscoveryWorkflowsEnabled(),
    ]);
    const { aborted, failedSpaceCount, snapshots } = await collectSpaceSnapshots({
      collect: (spaceId) =>
        collectSpaceSnapshot({
          attackDiscoveryWorkflowsEnabled,
          managedWorkflows,
          spaceId,
          uiSettingsClient: getUiSettingsClient(spaceId),
        }),
      concurrency: SNAPSHOT_SPACE_CONCURRENCY,
      logger,
      signal,
      spaceIds,
    });

    if (aborted || signal.aborted) {
      logger.debug(() => 'AlertZero telemetry snapshot aborted before reporting');
      return { state };
    }
    if (failedSpaceCount > 0) {
      logger.warn(
        `AlertZero telemetry snapshot could not read ${failedSpaceCount} of ${spaceIds.length} spaces; they are left out of the ${snapshotDay} snapshot`
      );
    }
    if (snapshots.length === 0) {
      return { state };
    }

    const report = createAlertZeroTelemetryReporter({ analytics, logger });
    report(
      ALERTZERO_TELEMETRY_EVENTS.AutonomySnapshot,
      buildAutonomySnapshotPayload({ snapshotDay, spaces: snapshots })
    );
    report(
      ALERTZERO_TELEMETRY_EVENTS.FeatureFlagsSnapshot,
      buildFeatureFlagsSnapshotPayload({ snapshotDay, spaces: snapshots })
    );

    return { state: { ...state, lastSnapshotDay: snapshotDay } };
  } catch (error) {
    logger.warn(
      `AlertZero telemetry snapshot failed; the next scheduled run tries again: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { state };
  }
};
