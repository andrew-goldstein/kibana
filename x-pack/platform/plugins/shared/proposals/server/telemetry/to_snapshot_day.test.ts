/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toSnapshotDay } from './to_snapshot_day';

describe('toSnapshotDay', () => {
  it('returns the UTC day of the snapshot time', () => {
    expect(toSnapshotDay(new Date('2026-09-28T23:59:59.999-04:00'))).toBe('2026-09-29');
  });

  it('starts a new day at UTC midnight', () => {
    expect(toSnapshotDay(new Date('2026-09-29T00:00:00.000Z'))).toBe('2026-09-29');
  });
});
