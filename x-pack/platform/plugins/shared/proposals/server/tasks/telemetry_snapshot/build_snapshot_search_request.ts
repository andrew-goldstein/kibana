/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SETTLED_STATUSES } from '../../telemetry';
import { SETTLED_BY_TERMS_SIZE, SPACE_COUNT_PRECISION_THRESHOLD } from './constants';
import { toAgeRangeAggregation } from './to_age_range_aggregation';

/**
 * The one search a snapshot runs: bounded aggregations over chain heads, never a document. A head
 * is a proposal nothing replaced, so a chain of retries and revisions counts once.
 */
export const buildSnapshotSearchRequest = (now: Date) => ({
  aggs: {
    executing: {
      aggs: { by_age: toAgeRangeAggregation({ field: 'decidedAt', now }) },
      filter: { term: { status: 'executing' } },
    },
    pending: {
      aggs: {
        by_age: toAgeRangeAggregation({ field: 'createdAt', now }),
        overdue: {
          aggs: { by_age: toAgeRangeAggregation({ field: 'expiresAt', now }) },
          filter: { range: { expiresAt: { lte: now.toISOString() } } },
        },
      },
      filter: { term: { status: 'pending' } },
    },
    settled: {
      aggs: {
        by_settled_by: { terms: { field: 'settledBy', size: SETTLED_BY_TERMS_SIZE } },
        no_settled_by: { missing: { field: 'settledBy' } },
      },
      terms: { field: 'status', include: [...SETTLED_STATUSES], size: SETTLED_STATUSES.length },
    },
    space_count: {
      cardinality: { field: 'spaceId', precision_threshold: SPACE_COUNT_PRECISION_THRESHOLD },
    },
  },
  query: {
    bool: {
      // A retried original keeps its `failed` status, so `supersededBy` is what marks it replaced.
      must_not: [{ exists: { field: 'supersededBy' } }, { term: { status: 'superseded' } }],
    },
  },
  size: 0,
  track_total_hits: false,
});

export type ProposalsSnapshotSearchRequest = ReturnType<typeof buildSnapshotSearchRequest>;
