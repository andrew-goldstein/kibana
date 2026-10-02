/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildStatusChangedPayload } from './build_status_changed_payload';
import { MANAGED_CALLER_FIELDS, PROPOSAL_ID_FIELDS, telemetryRecord } from './test_fixtures';

describe('buildStatusChangedPayload', () => {
  it('reports a real transition', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ status: 'executing' }),
        before: telemetryRecord(),
      })
    ).toEqual({
      ...MANAGED_CALLER_FIELDS,
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
      })
    ).toBeUndefined();
  });

  it('reports nothing for a move to superseded', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ status: 'superseded' }),
        before: telemetryRecord(),
      })
    ).toBeUndefined();
  });

  it.each(['deadline', 'iteration_limit', 'workflow_failure'] as const)(
    'ships the %s expiry reason',
    (settledBy) => {
      expect(
        buildStatusChangedPayload({
          after: telemetryRecord({ settledBy, status: 'expired' }),
          before: telemetryRecord(),
        })
      ).toEqual(expect.objectContaining({ expiry_reason: settledBy, to_status: 'expired' }));
    }
  );

  it('omits the expiry reason when none was recorded', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ status: 'expired' }),
        before: telemetryRecord(),
      })
    ).not.toHaveProperty('expiry_reason');
  });

  it('attributes a failure the loop recorded to the action', () => {
    const payload = buildStatusChangedPayload({
      after: telemetryRecord({ status: 'failed' }),
      before: telemetryRecord({ status: 'executing' }),
    });

    expect(payload?.failure_source).toBe('action');
    expect(payload).not.toHaveProperty('expiry_reason');
  });

  it('attributes a failure a settle path recorded to the workflow', () => {
    expect(
      buildStatusChangedPayload({
        after: telemetryRecord({ settledBy: 'workflow_failure', status: 'failed' }),
        before: telemetryRecord({ status: 'executing' }),
      })?.failure_source
    ).toBe('workflow_failure');
  });

  it('ships neither reason for any other terminal status', () => {
    const payload = buildStatusChangedPayload({
      after: telemetryRecord({ settledBy: 'deadline', status: 'no_action' }),
      before: telemetryRecord(),
    });

    expect(payload).not.toHaveProperty('expiry_reason');
    expect(payload).not.toHaveProperty('failure_source');
  });
});
