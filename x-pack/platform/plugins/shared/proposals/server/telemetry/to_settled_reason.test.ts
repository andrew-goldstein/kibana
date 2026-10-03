/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toSettledReason } from './to_settled_reason';

describe('toSettledReason', () => {
  it.each([
    ['deadline', 'deadline'],
    ['iteration_limit', 'iteration_limit'],
    ['workflow_failure', 'workflow_failure'],
  ] as const)(
    'reports an expired proposal settled by %s with that expiry reason',
    (settledBy, expected) => {
      expect(toSettledReason({ settledBy, status: 'expired' })).toBe(expected);
    }
  );

  it('leaves the reason absent for an expired proposal with no recorded settle path', () => {
    expect(toSettledReason({ settledBy: undefined, status: 'expired' })).toBeUndefined();
  });

  it('leaves the reason absent for an expired proposal with an unknown settle path', () => {
    expect(toSettledReason({ settledBy: 'something_new', status: 'expired' })).toBeUndefined();
  });

  it('reports a failed proposal with no recorded settle path as the action failing', () => {
    expect(toSettledReason({ settledBy: undefined, status: 'failed' })).toBe('action');
  });

  it.each(['deadline', 'iteration_limit', 'workflow_failure', 'something_new'])(
    'reports a failed proposal settled by %s as a workflow failure',
    (settledBy) => {
      expect(toSettledReason({ settledBy, status: 'failed' })).toBe('workflow_failure');
    }
  );

  it.each(['succeeded', 'no_action'] as const)('sends no reason for %s', (status) => {
    expect(toSettledReason({ settledBy: 'deadline', status })).toBeUndefined();
  });
});
