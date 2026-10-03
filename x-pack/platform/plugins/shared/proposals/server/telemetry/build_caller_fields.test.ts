/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCallerFields } from './build_caller_fields';

describe('buildCallerFields', () => {
  it("ships a managed caller's owner, run id and space flag", () => {
    expect(
      buildCallerFields({
        callerManagedBy: 'alertzero',
        callerRunId: 'exec-root',
        spaceId: 'default',
      })
    ).toEqual({
      caller_run_id: 'exec-root',
      consumer: 'alertzero',
      is_default_space: true,
      managed_caller: true,
    });
  });

  it('ships custom and omits the run id when neither was recorded', () => {
    expect(buildCallerFields({ spaceId: 'space-a' })).toEqual({
      consumer: 'custom',
      is_default_space: false,
      managed_caller: false,
    });
  });

  it('omits an empty run id rather than shipping a blank', () => {
    expect(buildCallerFields({ callerRunId: '', spaceId: 'space-a' })).not.toHaveProperty(
      'caller_run_id'
    );
  });

  it('never ships the space id', () => {
    expect(JSON.stringify(buildCallerFields({ spaceId: 'secret-space' }))).not.toContain(
      'secret-space'
    );
  });
});
