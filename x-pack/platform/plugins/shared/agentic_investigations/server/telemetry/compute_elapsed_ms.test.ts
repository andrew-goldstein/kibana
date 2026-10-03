/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { computeElapsedMs } from './compute_elapsed_ms';

const NOW = Date.parse('2026-09-28T12:00:00.000Z');

describe('computeElapsedMs', () => {
  it('returns the milliseconds between the timestamp and now', () => {
    expect(computeElapsedMs({ from: '2026-09-28T11:00:00.000Z', now: NOW })).toBe(3_600_000);
  });

  it('returns 0 when the timestamp is now', () => {
    expect(computeElapsedMs({ from: '2026-09-28T12:00:00.000Z', now: NOW })).toBe(0);
  });

  it('returns undefined when the timestamp is missing', () => {
    expect(computeElapsedMs({ from: undefined, now: NOW })).toBeUndefined();
  });

  it('returns undefined when the timestamp cannot be parsed', () => {
    expect(computeElapsedMs({ from: 'not a date', now: NOW })).toBeUndefined();
  });

  it('returns undefined when the timestamp is in the future (clock skew)', () => {
    expect(computeElapsedMs({ from: '2026-09-28T12:00:01.000Z', now: NOW })).toBeUndefined();
  });
});
