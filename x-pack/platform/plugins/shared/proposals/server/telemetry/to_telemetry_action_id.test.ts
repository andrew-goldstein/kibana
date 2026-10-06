/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toTelemetryActionId } from './to_telemetry_action_id';

describe('toTelemetryActionId', () => {
  it("ships a managed workflow's origin definition id", () => {
    expect(
      toTelemetryActionId({ managed: true, originManagedWorkflowId: 'security-isolate-host' })
    ).toBe('security-isolate-host');
  });

  it.each([
    ['an unmanaged workflow', { managed: false, originManagedWorkflowId: null }],
    ['a workflow with no managed fields', {}],
    [
      'an unmanaged workflow that still names an origin',
      { managed: false, originManagedWorkflowId: 'x' },
    ],
    ['a managed workflow with no origin', { managed: true, originManagedWorkflowId: null }],
    ['a managed workflow with a blank origin', { managed: true, originManagedWorkflowId: '  ' }],
  ])('ships custom for %s', (_label, workflow) => {
    expect(toTelemetryActionId(workflow)).toBe('custom');
  });
});
