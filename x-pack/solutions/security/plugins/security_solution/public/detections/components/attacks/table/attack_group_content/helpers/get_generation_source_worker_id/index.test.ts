/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID } from '@kbn/alertzero-common';

import { getGenerationSourceWorkerId } from '.';

describe('getGenerationSourceWorkerId', () => {
  it('returns the Worker id for its per-space workflow', () => {
    expect(
      getGenerationSourceWorkerId({
        generationSource: `workflow:${SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID}-default`,
        spaceId: 'default',
      })
    ).toBe(SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID);
  });

  it('returns the Worker id for its unsuffixed workflow', () => {
    expect(
      getGenerationSourceWorkerId({
        generationSource: `workflow:${SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID}`,
        spaceId: 'default',
      })
    ).toBe(SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID);
  });

  it('returns undefined for another space’s workflow', () => {
    expect(
      getGenerationSourceWorkerId({
        generationSource: `workflow:${SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID}-other`,
        spaceId: 'default',
      })
    ).toBeUndefined();
  });

  it('returns undefined for a workflow that is not a Worker', () => {
    expect(
      getGenerationSourceWorkerId({
        generationSource: 'workflow:my-custom-workflow',
        spaceId: 'default',
      })
    ).toBeUndefined();
  });

  it('returns undefined for a generation source without the workflow: prefix', () => {
    expect(
      getGenerationSourceWorkerId({
        generationSource: SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID,
        spaceId: 'default',
      })
    ).toBeUndefined();
  });

  it('returns undefined when there is no generation source', () => {
    expect(
      getGenerationSourceWorkerId({ generationSource: undefined, spaceId: 'default' })
    ).toBeUndefined();
  });
});
