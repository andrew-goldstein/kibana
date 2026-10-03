/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { bucketDuration } from './bucket_duration';

const HOUR_MS = 60 * 60 * 1000;

describe('bucketDuration', () => {
  it.each([
    [0, 'le_1h'],
    [HOUR_MS, 'le_1h'],
    [HOUR_MS + 1, 'le_24h'],
    [24 * HOUR_MS, 'le_24h'],
    [24 * HOUR_MS + 1, 'le_72h'],
    [72 * HOUR_MS, 'le_72h'],
    [72 * HOUR_MS + 1, 'le_7d'],
    [7 * 24 * HOUR_MS, 'le_7d'],
    [7 * 24 * HOUR_MS + 1, 'gt_7d'],
  ])('buckets %i ms as %s', (durationMs, expected) => {
    expect(bucketDuration(durationMs)).toBe(expected);
  });

  it('buckets a negative duration (clock skew) as the shortest bucket', () => {
    expect(bucketDuration(-5_000)).toBe('le_1h');
  });
});
