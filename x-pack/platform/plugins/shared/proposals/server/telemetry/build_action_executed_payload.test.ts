/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildActionExecutedPayload } from './build_action_executed_payload';
import { COMMON_FIELDS, PROPOSAL_ID_FIELDS, telemetryRecord } from './test_fixtures';

const APPROVED_AT = '2026-09-01T02:00:00.000Z';
const executing = telemetryRecord({
  decidedAt: APPROVED_AT,
  decision: 'approved',
  status: 'executing',
});
const NOW = Date.parse(APPROVED_AT) + 90_000;

describe('buildActionExecutedPayload', () => {
  it.each(['succeeded', 'failed'] as const)('reports an action that %s', (status) => {
    expect(
      buildActionExecutedPayload({ after: { ...executing, status }, before: executing, now: NOW })
    ).toEqual({
      ...COMMON_FIELDS,
      ...PROPOSAL_ID_FIELDS,
      category: 'respond',
      execution_duration_ms: 90_000,
      outcome: status,
    });
  });

  it("never names the action, which the chain's created event does, nor its raw workflow id", () => {
    const custom = {
      ...executing,
      actionId: 'custom',
      actionWorkflowId: 'secret-customer-workflow',
    };

    const payload = buildActionExecutedPayload({
      after: { ...custom, status: 'succeeded' },
      before: custom,
      now: NOW,
    });

    expect(payload).not.toHaveProperty('action_id');
    expect(JSON.stringify(payload)).not.toContain('secret-customer-workflow');
  });

  it('omits the duration when the approval time is unknown', () => {
    const withoutApproval = { ...executing, decidedAt: undefined };

    expect(
      buildActionExecutedPayload({
        after: { ...withoutApproval, status: 'succeeded' },
        before: withoutApproval,
        now: NOW,
      })
    ).not.toHaveProperty('execution_duration_ms');
  });

  it.each(['gate', 'gate_ended'] as const)(
    'reports nothing for a failure the %s settle path recorded',
    (settlePath) => {
      expect(
        buildActionExecutedPayload({
          after: { ...executing, settlePath, status: 'failed' },
          before: executing,
          now: NOW,
        })
      ).toBeUndefined();
    }
  );

  it('reports nothing when no action was running', () => {
    expect(
      buildActionExecutedPayload({
        after: telemetryRecord({ decision: 'approved', status: 'no_action' }),
        before: telemetryRecord(),
        now: NOW,
      })
    ).toBeUndefined();
  });

  it('reports nothing for a same-status rewrite of a settled outcome', () => {
    const failed = { ...executing, status: 'failed' as const };

    expect(buildActionExecutedPayload({ after: failed, before: failed, now: NOW })).toBeUndefined();
  });
});
