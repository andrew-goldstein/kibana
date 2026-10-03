/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildDecidedPayload } from './build_decided_payload';
import { MANAGED_CALLER_FIELDS, PROPOSAL_ID_FIELDS, telemetryRecord } from './test_fixtures';

const before = telemetryRecord();

/** Decided two hours after the chain root was created, well inside the deadline. */
const decided = (overrides: Parameters<typeof telemetryRecord>[0] = {}) =>
  telemetryRecord({
    decidedAt: '2026-09-01T02:00:00.000Z',
    decision: 'approved',
    decisionSource: 'human',
    status: 'executing',
    ...overrides,
  });

describe('buildDecidedPayload', () => {
  it('reports a human approval with its time to decision', () => {
    expect(buildDecidedPayload({ after: decided(), before })).toEqual({
      ...MANAGED_CALLER_FIELDS,
      ...PROPOSAL_ID_FIELDS,
      attempt: 1,
      decided_after_deadline: false,
      decision: 'approved',
      decision_source: 'human',
      time_to_decision_ms: 2 * 60 * 60 * 1000,
    });
  });

  it('omits the time to decision for an autonomy decision', () => {
    const payload = buildDecidedPayload({ after: decided({ decisionSource: 'autonomy' }), before });

    expect(payload?.decision_source).toBe('autonomy');
    expect(payload).not.toHaveProperty('time_to_decision_ms');
  });

  it('treats a decision recorded without a source as human', () => {
    expect(
      buildDecidedPayload({ after: decided({ decisionSource: undefined }), before })
        ?.decision_source
    ).toBe('human');
  });

  it('flags a late decision and still measures it', () => {
    const payload = buildDecidedPayload({
      after: decided({ decidedAt: '2026-09-05T00:00:00.000Z' }),
      before,
    });

    expect(payload?.decided_after_deadline).toBe(true);
    expect(payload?.time_to_decision_ms).toBe(4 * 24 * 60 * 60 * 1000);
  });

  it('never flags a proposal without a deadline as late', () => {
    expect(
      buildDecidedPayload({ after: decided({ expiresAt: undefined }), before })
        ?.decided_after_deadline
    ).toBe(false);
  });

  it('ships the dismiss reason with a dismissal', () => {
    expect(
      buildDecidedPayload({
        after: decided({ decision: 'dismissed', dismissReason: 'duplicate', status: 'no_action' }),
        before,
      })
    ).toEqual(expect.objectContaining({ decision: 'dismissed', dismiss_reason: 'duplicate' }));
  });

  it('never ships a dismiss reason with an approval', () => {
    expect(
      buildDecidedPayload({ after: decided({ dismissReason: 'duplicate' }), before })
    ).not.toHaveProperty('dismiss_reason');
  });

  it('carries the clone generation', () => {
    expect(buildDecidedPayload({ after: decided({ attempt: 3 }), before })?.attempt).toBe(3);
  });

  it('reads a record without an attempt as the first', () => {
    expect(buildDecidedPayload({ after: decided({ attempt: undefined }), before })?.attempt).toBe(
      1
    );
  });

  it('reports nothing when the write recorded no decision', () => {
    expect(
      buildDecidedPayload({ after: telemetryRecord({ status: 'expired' }), before })
    ).toBeUndefined();
  });

  it('reports nothing when the decision was already recorded', () => {
    const alreadyDecided = decided();

    expect(
      buildDecidedPayload({ after: decided({ status: 'succeeded' }), before: alreadyDecided })
    ).toBeUndefined();
  });
});
