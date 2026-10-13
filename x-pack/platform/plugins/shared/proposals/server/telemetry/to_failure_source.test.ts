/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toFailureSource } from './to_failure_source';

describe('toFailureSource', () => {
  it.each([
    ['action', undefined],
    ['workflow_failure', 'gate'],
    ['gate_ended', 'gate_ended'],
  ] as const)('reads %s from settle path %s', (failureSource, settlePath) => {
    expect(toFailureSource(settlePath)).toBe(failureSource);
  });
});
