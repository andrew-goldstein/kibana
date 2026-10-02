/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isDefaultSpace } from './is_default_space';

describe('isDefaultSpace', () => {
  it('is true for the default space', () => {
    expect(isDefaultSpace('default')).toBe(true);
  });

  it('is false for any other space', () => {
    expect(isDefaultSpace('space-a')).toBe(false);
  });
});
