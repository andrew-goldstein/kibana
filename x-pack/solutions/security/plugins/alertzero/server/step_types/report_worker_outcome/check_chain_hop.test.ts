/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { checkChainHop } from './check_chain_hop';
import { SPACE_ID, createExecution } from './worker_chain.mock';

describe('checkChainHop', () => {
  it('accepts a non-test execution AlertZero manages in the same space', () => {
    expect(checkChainHop(createExecution({ id: 'exec-hop' }), SPACE_ID)).toBeUndefined();
  });

  it.each([
    ['in another space', { spaceId: 'space-b' }, 'lineage_unavailable'],
    ['with no space id (a legacy document)', { spaceId: undefined }, 'lineage_unavailable'],
    ['persisted as a test run', { isTestRun: true }, 'test_run'],
    ['not managed', { managed: false }, 'not_managed'],
    ['managed by another plugin', { managedBy: 'proposals' }, 'not_managed'],
  ])('rejects an execution %s', (_label, overrides, reason) => {
    expect(checkChainHop(createExecution({ id: 'exec-hop', ...overrides }), SPACE_ID)).toBe(reason);
  });
});
