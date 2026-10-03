/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ProposalSettledReason,
  ProposalSettledStatus,
  ProposalsSnapshotAgeBucketCount,
  ProposalsSnapshotPayload,
  ProposalsSnapshotSettledCount,
} from '../../telemetry';
import {
  DURATION_BUCKETS,
  SETTLED_REASONS,
  SETTLED_STATUSES,
  toSettledReason,
} from '../../telemetry';
import type { ProposalsSnapshotAggregations, SnapshotRangeBucket } from './types';

const isSettledStatus = (status: string | number): status is ProposalSettledStatus =>
  (SETTLED_STATUSES as readonly unknown[]).includes(status);

/** Non-empty age buckets, in bucket order, whatever order the search returned them in. */
const toAgeBucketCounts = (buckets: SnapshotRangeBucket[]): ProposalsSnapshotAgeBucketCount[] =>
  DURATION_BUCKETS.flatMap((ageBucket) => {
    const count = buckets
      .filter(({ key }) => key === ageBucket)
      .reduce((sum, { doc_count: docCount }) => sum + docCount, 0);
    return count > 0 ? [{ age_bucket: ageBucket, count }] : [];
  });

/** Orders by status, then reason (none first), so equal snapshots compare equal. */
const compareSettledCounts = (
  a: ProposalsSnapshotSettledCount,
  b: ProposalsSnapshotSettledCount
): number => {
  const reasonRank = (reason: ProposalSettledReason | undefined) =>
    reason === undefined ? -1 : SETTLED_REASONS.indexOf(reason);
  return (
    SETTLED_STATUSES.indexOf(a.status) - SETTLED_STATUSES.indexOf(b.status) ||
    reasonRank(a.reason) - reasonRank(b.reason)
  );
};

/**
 * Settled counts by status and reason. Several stored settle paths can map to one reason (any
 * settle path on a `failed` head is a workflow failure), so their counts are summed.
 */
const toSettledCounts = (
  buckets: ProposalsSnapshotAggregations['settled']['buckets']
): ProposalsSnapshotSettledCount[] => {
  const counts = buckets.flatMap(
    ({ by_settled_by: bySettledBy, key, no_settled_by: noSettledBy }) => {
      if (!isSettledStatus(key)) {
        return [];
      }
      return [
        ...bySettledBy.buckets.map(({ doc_count: count, key: settledBy }) => ({
          count,
          reason: toSettledReason({ settledBy: String(settledBy), status: key }),
          status: key,
        })),
        {
          count: noSettledBy.doc_count,
          reason: toSettledReason({ settledBy: undefined, status: key }),
          status: key,
        },
      ];
    }
  );

  return counts
    .reduce<ProposalsSnapshotSettledCount[]>((merged, { count, reason, status }) => {
      const existing = merged.find((entry) => entry.status === status && entry.reason === reason);
      return existing
        ? merged.map((entry) =>
            entry === existing ? { ...entry, count: entry.count + count } : entry
          )
        : [...merged, { count, ...(reason !== undefined ? { reason } : {}), status }];
    }, [])
    .filter(({ count }) => count > 0)
    .sort(compareSettledCounts);
};

/**
 * The `proposals_snapshot` payload from the snapshot search's aggregations: cluster-level counts
 * only, with no space or proposal id. Missing aggregations (no proposals index yet) read as an
 * empty snapshot.
 */
export const buildSnapshotPayload = ({
  aggregations,
  snapshotDay,
}: {
  aggregations: ProposalsSnapshotAggregations | undefined;
  snapshotDay: string;
}): ProposalsSnapshotPayload => ({
  executing_by_age: toAgeBucketCounts(aggregations?.executing.by_age.buckets ?? []),
  pending_by_age: toAgeBucketCounts(aggregations?.pending.by_age.buckets ?? []),
  pending_overdue_by_age: toAgeBucketCounts(aggregations?.pending.overdue.by_age.buckets ?? []),
  settled: toSettledCounts(aggregations?.settled.buckets ?? []),
  snapshot_day: snapshotDay,
  space_count: aggregations?.space_count.value ?? 0,
});
