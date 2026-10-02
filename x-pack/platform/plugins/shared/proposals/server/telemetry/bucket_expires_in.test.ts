/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { bucketExpiresIn } from './bucket_expires_in';

const createdAt = '2026-09-28T00:00:00.000Z';

describe('bucketExpiresIn', () => {
  it('returns `none` when the proposal has no deadline', () => {
    expect(bucketExpiresIn({ createdAt })).toBe('none');
  });

  it('returns `none` for an empty deadline, as Liquid renders an absent input', () => {
    expect(bucketExpiresIn({ createdAt, expiresAt: '' })).toBe('none');
  });

  it('returns `none` for an unparseable deadline', () => {
    expect(bucketExpiresIn({ createdAt, expiresAt: 'not a date' })).toBe('none');
  });

  it('returns `none` for an unparseable creation time', () => {
    expect(bucketExpiresIn({ createdAt: 'not a date', expiresAt: createdAt })).toBe('none');
  });

  it('buckets the default 72h deadline as `le_72h`', () => {
    expect(bucketExpiresIn({ createdAt, expiresAt: '2026-10-01T00:00:00.000Z' })).toBe('le_72h');
  });

  it('buckets a one-minute deadline as `le_1h`', () => {
    expect(bucketExpiresIn({ createdAt, expiresAt: '2026-09-28T00:01:00.000Z' })).toBe('le_1h');
  });

  it('buckets a deadline beyond a week as `gt_7d`', () => {
    expect(bucketExpiresIn({ createdAt, expiresAt: '2026-10-28T00:00:00.000Z' })).toBe('gt_7d');
  });
});
