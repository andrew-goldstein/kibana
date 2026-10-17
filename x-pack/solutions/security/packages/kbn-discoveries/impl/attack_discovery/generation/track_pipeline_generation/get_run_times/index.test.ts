/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getRunTimes } from '.';

describe('getRunTimes', () => {
  const now = new Date('2026-10-16T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the start and finish times of a finished run', () => {
    expect(
      getRunTimes({
        finishedAt: '2026-10-16T11:05:00.000Z',
        startedAt: '2026-10-16T11:00:00.000Z',
      })
    ).toEqual({
      endTime: new Date('2026-10-16T11:05:00.000Z'),
      startTime: new Date('2026-10-16T11:00:00.000Z'),
    });
  });

  it.each([
    ['an empty', ''],
    ['no', undefined],
  ])('ends a run with %s finish time now', (_description, finishedAt) => {
    expect(
      getRunTimes({
        finishedAt,
        startedAt: '2026-10-16T11:00:00.000Z',
      } as unknown as Parameters<typeof getRunTimes>[0])
    ).toEqual({
      endTime: now,
      startTime: new Date('2026-10-16T11:00:00.000Z'),
    });
  });
});
