/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCallerFields } from './build_caller_fields';

describe('buildCallerFields', () => {
  it("ships a verified managed caller's run id, the proposal's origin and the space flag", () => {
    expect(
      buildCallerFields({
        callerManaged: true,
        callerRunId: 'exec-root',
        origin: 'alertzero',
        spaceId: 'default',
      })
    ).toEqual({
      caller_run_id: 'exec-root',
      is_default_space: true,
      managed_caller: true,
      origin: 'alertzero',
    });
  });

  it('ships the origin the caller declared, even when the caller is not managed', () => {
    // `origin` is declared by the caller, so a custom workflow can claim any
    // member; `managed_caller` is the server-verified half.
    expect(
      buildCallerFields({ callerManaged: false, origin: 'alertzero', spaceId: 'space-a' })
    ).toEqual({
      is_default_space: false,
      managed_caller: false,
      origin: 'alertzero',
    });
  });

  it('reads a caller that was never verified as unmanaged', () => {
    expect(buildCallerFields({ origin: 'nightshift', spaceId: 'space-a' })).toEqual({
      is_default_space: false,
      managed_caller: false,
      origin: 'nightshift',
    });
  });

  it('omits an empty run id rather than shipping a blank', () => {
    expect(
      buildCallerFields({ callerRunId: '', origin: 'alertzero', spaceId: 'space-a' })
    ).not.toHaveProperty('caller_run_id');
  });

  it('never ships the space id', () => {
    expect(
      JSON.stringify(buildCallerFields({ origin: 'alertzero', spaceId: 'secret-space' }))
    ).not.toContain('secret-space');
  });
});
