/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildStatusChangedPayload } from './build_status_changed_payload';
import { COMMON_FIELDS, PROPOSAL_ID_FIELDS, telemetryRecord } from './test_fixtures';

/** `telemetryRecord()`'s deadline. */
const EXPIRES_AT_MS = Date.parse('2026-09-04T00:00:00.000Z');
/** Any time well before the deadline. */
const BEFORE_DEADLINE_MS = EXPIRES_AT_MS - 60 * 60 * 1000;

describe('buildStatusChangedPayload', () => {
  it('reports a real transition', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ status: 'executing' }),
        before: telemetryRecord(),
        now: BEFORE_DEADLINE_MS,
      })
    ).toEqual({
      ...COMMON_FIELDS,
      ...PROPOSAL_ID_FIELDS,
      from_status: 'pending',
      to_status: 'executing',
    });
  });

  it('reports nothing for a same-status rewrite', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ status: 'failed' }),
        before: telemetryRecord({ status: 'failed' }),

        now: BEFORE_DEADLINE_MS,
      })
    ).toBeUndefined();
  });

  it('reports nothing for a move to superseded', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ status: 'superseded' }),
        before: telemetryRecord(),

        now: BEFORE_DEADLINE_MS,
      })
    ).toBeUndefined();
  });

  it.each([
    ['deadline', 'gate', EXPIRES_AT_MS],
    ['settled_early', 'gate', BEFORE_DEADLINE_MS],
    ['external', 'external', BEFORE_DEADLINE_MS],
    ['gate_ended', 'gate_ended', EXPIRES_AT_MS],
  ] as const)('derives the %s expiry reason', (expiryReason, settlePath, now) => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ settlePath, status: 'expired' }),
        before: telemetryRecord(),
        now,
      })
    ).toEqual(expect.objectContaining({ expiry_reason: expiryReason, to_status: 'expired' }));
  });

  it('omits the expiry reason when no settle path wrote the expiry', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ status: 'expired' }),
        before: telemetryRecord(),

        now: BEFORE_DEADLINE_MS,
      })
    ).not.toHaveProperty('expiry_reason');
  });

  it('attributes a failure the loop recorded to the action', () => {
    const payload = buildStatusChangedPayload({
      after: telemetryRecord({ status: 'failed' }),
      before: telemetryRecord({ status: 'executing' }),
      now: BEFORE_DEADLINE_MS,
    });

    expect(payload?.failure_source).toBe('action');
    expect(payload).not.toHaveProperty('expiry_reason');
  });

  it("attributes a failure the gate's settle recorded to the workflow", () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ settlePath: 'gate', status: 'failed' }),
        before: telemetryRecord({ status: 'executing' }),
        now: BEFORE_DEADLINE_MS,
      })?.failure_source
    ).toBe('workflow_failure');
  });

  it('attributes a failure settled after the gate execution ended to the ended gate', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ settlePath: 'gate_ended', status: 'failed' }),
        before: telemetryRecord({ status: 'executing' }),
        now: BEFORE_DEADLINE_MS,
      })?.failure_source
    ).toBe('gate_ended');
  });

  it('ships neither reason for any other terminal status', () => {
    const payload = buildStatusChangedPayload({
      after: telemetryRecord({ settlePath: 'gate', status: 'no_action' }),
      before: telemetryRecord(),
      now: EXPIRES_AT_MS,
    });

    expect(payload).not.toHaveProperty('expiry_reason');
    expect(payload).not.toHaveProperty('failure_source');
  });
});
