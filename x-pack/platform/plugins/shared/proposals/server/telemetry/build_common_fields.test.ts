/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCommonFields } from './build_common_fields';

describe('buildCommonFields', () => {
  it("ships the proposal's origin, the space flag and its gate execution id", () => {
    expect(
      buildCommonFields({
        origin: 'alertzero',
        spaceId: 'default',
        workflowExecutionId: 'exec-gate',
      })
    ).toEqual({
      is_default_space: true,
      origin: 'alertzero',
      workflow_execution_id: 'exec-gate',
    });
  });

  it('omits the gate execution id for a proposal created outside a workflow', () => {
    expect(buildCommonFields({ origin: 'nightshift', spaceId: 'space-a' })).toEqual({
      is_default_space: false,
      origin: 'nightshift',
    });
  });

  it('omits an empty gate execution id rather than shipping a blank', () => {
    expect(
      buildCommonFields({ origin: 'alertzero', spaceId: 'space-a', workflowExecutionId: '' })
    ).not.toHaveProperty('workflow_execution_id');
  });

  it('never ships the space id', () => {
    expect(
      JSON.stringify(buildCommonFields({ origin: 'alertzero', spaceId: 'secret-space' }))
    ).not.toContain('secret-space');
  });
});
