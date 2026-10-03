/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import type { ProposalsTelemetryAnalytics } from '../../telemetry';
import type { ProposalsSnapshotSearchRequest } from './build_snapshot_search_request';

/** A `date_range` bucket of the snapshot search. */
export interface SnapshotRangeBucket {
  doc_count: number;
  key: string;
}

/** A `terms` bucket of the snapshot search. */
export interface SnapshotTermsBucket {
  doc_count: number;
  key: string | number;
}

interface SnapshotAgeAggregate {
  by_age: { buckets: SnapshotRangeBucket[] };
}

/** The aggregations the snapshot search returns; absent when the index does not exist yet. */
export interface ProposalsSnapshotAggregations {
  executing: SnapshotAgeAggregate;
  pending: SnapshotAgeAggregate & { overdue: SnapshotAgeAggregate };
  settled: {
    buckets: Array<
      SnapshotTermsBucket & {
        by_settled_by: { buckets: SnapshotTermsBucket[] };
        no_settled_by: { doc_count: number };
      }
    >;
  };
  space_count: { value: number };
}

/** Everything a snapshot run needs, resolved from the plugin's start services. */
export interface TelemetrySnapshotDependencies {
  analytics: ProposalsTelemetryAnalytics;
  /** The telemetry plugin's opt-in stream; absent without the telemetry plugin (opted out). */
  isOptedIn$?: Observable<boolean>;
  /** Runs the snapshot search over every space's proposals as the internal user. */
  searchSnapshot: (
    request: ProposalsSnapshotSearchRequest,
    options: { signal: AbortSignal }
  ) => Promise<{ aggregations?: ProposalsSnapshotAggregations }>;
}
