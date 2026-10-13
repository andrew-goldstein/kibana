/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toExpiryReason } from './to_expiry_reason';

const EXPIRES_AT = '2026-10-14T12:00:00.000Z';
const EXPIRES_AT_MS = Date.parse(EXPIRES_AT);

describe('toExpiryReason', () => {
  it('reads a gate settle at the deadline as the deadline', () => {
    expect(toExpiryReason({ expiresAt: EXPIRES_AT, now: EXPIRES_AT_MS, settlePath: 'gate' })).toBe(
      'deadline'
    );
  });

  it('reads a gate settle after the deadline as the deadline', () => {
    expect(
      toExpiryReason({ expiresAt: EXPIRES_AT, now: EXPIRES_AT_MS + 60_000, settlePath: 'gate' })
    ).toBe('deadline');
  });

  it('allows the gate to fire up to a second early, since it waits in whole seconds', () => {
    expect(
      toExpiryReason({ expiresAt: EXPIRES_AT, now: EXPIRES_AT_MS - 999, settlePath: 'gate' })
    ).toBe('deadline');
  });

  it('reads a gate settle well before the deadline as settled early', () => {
    expect(
      toExpiryReason({ expiresAt: EXPIRES_AT, now: EXPIRES_AT_MS - 60_000, settlePath: 'gate' })
    ).toBe('settled_early');
  });

  it('reads a gate settle on a proposal without a deadline as settled early', () => {
    expect(toExpiryReason({ now: EXPIRES_AT_MS, settlePath: 'gate' })).toBe('settled_early');
  });

  it('reads an expiry written outside the gate as external, whatever the time', () => {
    expect(
      toExpiryReason({ expiresAt: EXPIRES_AT, now: EXPIRES_AT_MS + 60_000, settlePath: 'external' })
    ).toBe('external');
  });

  it('reads an expiry settled after the gate execution ended as gate ended, whatever the time', () => {
    expect(
      toExpiryReason({
        expiresAt: EXPIRES_AT,
        now: EXPIRES_AT_MS + 60_000,
        settlePath: 'gate_ended',
      })
    ).toBe('gate_ended');
  });

  it('gives no reason for an expiry no settle path wrote', () => {
    expect(toExpiryReason({ expiresAt: EXPIRES_AT, now: EXPIRES_AT_MS })).toBeUndefined();
  });
});
