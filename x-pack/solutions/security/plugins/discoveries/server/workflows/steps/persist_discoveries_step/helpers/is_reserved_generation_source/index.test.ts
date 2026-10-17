/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isReservedGenerationSource } from '.';

describe('isReservedGenerationSource', () => {
  it('returns true for a value with the workflow: prefix', () => {
    expect(isReservedGenerationSource('workflow:system-security-floor-attack-discovery')).toBe(
      true
    );
  });

  it('returns false for any other value', () => {
    expect(isReservedGenerationSource('test-producer')).toBe(false);
  });

  it('returns false when no value is set', () => {
    expect(isReservedGenerationSource(undefined)).toBe(false);
  });
});
