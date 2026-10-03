/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDurationBucket } from '../../telemetry';
import { DURATION_BUCKET_UPPER_BOUNDS_MS, LONGEST_DURATION_BUCKET } from '../../telemetry';

/** One `date_range` range: `from` is inclusive and `to` exclusive, both ISO timestamps. */
export interface AgeRange {
  from?: string;
  key: ProposalDurationBucket;
  to?: string;
}

export interface AgeRangeAggregation {
  date_range: { field: string; ranges: AgeRange[] };
}

/**
 * A `date_range` aggregation that buckets documents by the age of `field` at `now`, with the
 * same upper-inclusive boundaries as `bucketDuration`. A timestamp after `now` (clock skew) lands
 * in the shortest bucket, as a negative duration does there.
 */
export const toAgeRangeAggregation = ({
  field,
  now,
}: {
  field: string;
  now: Date;
}): AgeRangeAggregation => {
  const nowMs = now.getTime();
  const before = (durationMs: number) => new Date(nowMs - durationMs).toISOString();
  const bounded = DURATION_BUCKET_UPPER_BOUNDS_MS.map(([key, upperBoundMs], index) => {
    const lowerBoundMs = index === 0 ? undefined : DURATION_BUCKET_UPPER_BOUNDS_MS[index - 1][1];
    return {
      from: before(upperBoundMs),
      key,
      ...(lowerBoundMs !== undefined ? { to: before(lowerBoundMs) } : {}),
    };
  });
  const longestUpperBoundMs =
    DURATION_BUCKET_UPPER_BOUNDS_MS[DURATION_BUCKET_UPPER_BOUNDS_MS.length - 1][1];

  return {
    date_range: {
      field,
      ranges: [...bounded, { key: LONGEST_DURATION_BUCKET, to: before(longestUpperBoundMs) }],
    },
  };
};
