/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PROPOSALS_TELEMETRY_EVENTS } from './constants';
import { buildUpdateEvents } from './build_update_events';
import { PROPOSAL_ID_FIELDS, telemetryRecord } from './test_fixtures';

const NOW = Date.parse('2026-09-01T03:00:00.000Z');

const eventTypes = (events: ReturnType<typeof buildUpdateEvents>) =>
  events.map(({ eventType }) => eventType);

describe('buildUpdateEvents', () => {
  it('reports the decision and the transition of an approval that starts the action', () => {
    expect(
      eventTypes(
        buildUpdateEvents({
          after: telemetryRecord({
            decidedAt: '2026-09-01T02:00:00.000Z',
            decision: 'approved',
            status: 'executing',
          }),
          before: telemetryRecord(),
          now: NOW,
        })
      )
    ).toEqual([
      PROPOSALS_TELEMETRY_EVENTS.ProposalDecided,
      PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
    ]);
  });

  it("reports the transition and the outcome of the action's result", () => {
    const executing = telemetryRecord({
      decidedAt: '2026-09-01T02:00:00.000Z',
      decision: 'approved',
      status: 'executing',
    });

    expect(
      eventTypes(
        buildUpdateEvents({
          after: { ...executing, status: 'succeeded' },
          before: executing,
          now: NOW,
        })
      )
    ).toEqual([
      PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
      PROPOSALS_TELEMETRY_EVENTS.ActionExecuted,
    ]);
  });

  it('reports only the transition of an expiry', () => {
    expect(
      eventTypes(
        buildUpdateEvents({
          after: telemetryRecord({ settledBy: 'deadline', status: 'expired' }),
          before: telemetryRecord(),
          now: NOW,
        })
      )
    ).toEqual([PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged]);
  });

  it('reports nothing for an idempotent rewrite', () => {
    const failed = telemetryRecord({ decision: 'approved', status: 'failed' });

    expect(buildUpdateEvents({ after: failed, before: failed, now: NOW })).toEqual([]);
  });

  it('carries the same proposal ids on every event of one write', () => {
    const executing = telemetryRecord({
      decidedAt: '2026-09-01T02:00:00.000Z',
      decision: 'approved',
      status: 'executing',
    });

    const events = buildUpdateEvents({
      after: { ...executing, status: 'succeeded' },
      before: executing,
      now: NOW,
    });

    expect(events.map(({ payload }) => payload)).toEqual(
      Array(2).fill(expect.objectContaining(PROPOSAL_ID_FIELDS))
    );
  });

  it('pairs each event type with its own payload', () => {
    const [decided] = buildUpdateEvents({
      after: telemetryRecord({
        decidedAt: '2026-09-01T02:00:00.000Z',
        decision: 'dismissed',
        dismissReason: 'risk_accepted',
        status: 'no_action',
      }),
      before: telemetryRecord(),
      now: NOW,
    });

    expect(decided).toEqual({
      eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalDecided,
      payload: expect.objectContaining({ decision: 'dismissed', dismiss_reason: 'risk_accepted' }),
    });
  });
});
