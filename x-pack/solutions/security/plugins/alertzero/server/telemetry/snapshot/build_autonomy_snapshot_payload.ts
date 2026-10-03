/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { groupBy } from 'lodash';
import type {
  AlertZeroAutonomySnapshotPayload,
  AlertZeroAutonomySnapshotWorker,
} from '../event_types';
import { resolveWorkerCatalogFields } from '../envelope/resolve_worker_catalog_fields';
import type { SpaceSnapshot } from './types';

type WorkerCombination = Omit<AlertZeroAutonomySnapshotWorker, 'count'>;

const toCombinationKey = ({ autonomy_level: level, enabled, worker_id: id }: WorkerCombination) =>
  `${id}\u0000${level}\u0000${enabled}`;

const compareWorkers = (
  left: AlertZeroAutonomySnapshotWorker,
  right: AlertZeroAutonomySnapshotWorker
): number =>
  left.worker_id.localeCompare(right.worker_id) ||
  left.autonomy_level.localeCompare(right.autonomy_level) ||
  Number(left.enabled) - Number(right.enabled);

/** Sums the installed Workers of every space into one `alertzero_autonomy_snapshot` payload. */
export const buildAutonomySnapshotPayload = ({
  snapshotDay,
  spaces,
}: {
  snapshotDay: string;
  spaces: readonly SpaceSnapshot[];
}): AlertZeroAutonomySnapshotPayload => {
  const combinations = spaces.flatMap(({ workers }) =>
    workers.map(
      ({ autonomyLevel, enabled, workerId }): WorkerCombination => ({
        autonomy_level: autonomyLevel,
        enabled,
        worker_id: resolveWorkerCatalogFields(workerId).worker_id,
      })
    )
  );

  return {
    snapshot_day: snapshotDay,
    space_count: spaces.length,
    workers: Object.values(groupBy(combinations, toCombinationKey))
      .map(([combination, ...rest]) => ({ ...combination, count: rest.length + 1 }))
      .sort(compareWorkers),
  };
};
