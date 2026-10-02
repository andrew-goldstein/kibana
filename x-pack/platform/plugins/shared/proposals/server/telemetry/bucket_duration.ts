/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDurationBucket } from './constants';

const HOUR_MS = 60 * 60 * 1000;

/** The bucket for any duration longer than every upper bound. */
export const LONGEST_DURATION_BUCKET = 'gt_7d' as const satisfies ProposalDurationBucket;

/** Upper bounds in ascending order; anything longer is `LONGEST_DURATION_BUCKET`. */
export const DURATION_BUCKET_UPPER_BOUNDS_MS: ReadonlyArray<
  readonly [ProposalDurationBucket, number]
> = [
  ['le_1h', HOUR_MS],
  ['le_24h', 24 * HOUR_MS],
  ['le_72h', 72 * HOUR_MS],
  ['le_7d', 7 * 24 * HOUR_MS],
];

/** Buckets a duration so events ship a coarse age or deadline, never an exact time. */
export const bucketDuration = (durationMs: number): ProposalDurationBucket =>
  DURATION_BUCKET_UPPER_BOUNDS_MS.find(([, upperBoundMs]) => durationMs <= upperBoundMs)?.[0] ??
  LONGEST_DURATION_BUCKET;
