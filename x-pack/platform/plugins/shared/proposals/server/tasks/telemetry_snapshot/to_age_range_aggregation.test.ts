/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { bucketDuration, DURATION_BUCKETS } from '../../telemetry';
import { toAgeRangeAggregation } from './to_age_range_aggregation';

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-09-28T12:00:00.000Z');

/** Elasticsearch `date_range` semantics: `from` is inclusive and `to` is exclusive. */
const rangeContains = ({ from, to }: { from?: string; to?: string }, timestampMs: number) =>
  (from === undefined || timestampMs >= Date.parse(from)) &&
  (to === undefined || timestampMs < Date.parse(to));

describe('toAgeRangeAggregation', () => {
  it('ranges over the given date field', () => {
    expect(toAgeRangeAggregation({ field: 'createdAt', now: NOW }).date_range.field).toBe(
      'createdAt'
    );
  });

  it('declares one range per duration bucket, in bucket order', () => {
    const { ranges } = toAgeRangeAggregation({ field: 'createdAt', now: NOW }).date_range;

    expect(ranges.map(({ key }) => key)).toEqual([...DURATION_BUCKETS]);
  });

  it.each([
    -5 * 60 * 1000,
    0,
    1,
    HOUR_MS - 1,
    HOUR_MS,
    HOUR_MS + 1,
    24 * HOUR_MS,
    24 * HOUR_MS + 1,
    72 * HOUR_MS,
    72 * HOUR_MS + 1,
    7 * 24 * HOUR_MS,
    7 * 24 * HOUR_MS + 1,
    30 * 24 * HOUR_MS,
  ])('puts an age of %i ms in exactly the bucket bucketDuration reports', (ageMs) => {
    const { ranges } = toAgeRangeAggregation({ field: 'createdAt', now: NOW }).date_range;

    const containing = ranges
      .filter((range) => rangeContains(range, NOW.getTime() - ageMs))
      .map(({ key }) => key);

    expect(containing).toEqual([bucketDuration(ageMs)]);
  });
});
