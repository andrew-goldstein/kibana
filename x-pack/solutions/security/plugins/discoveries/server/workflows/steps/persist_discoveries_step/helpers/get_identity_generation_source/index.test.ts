/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getIdentityGenerationSource } from '.';

describe('getIdentityGenerationSource', () => {
  it('returns the owning workflow’s definition id when the workflow is installed per space', () => {
    expect(
      getIdentityGenerationSource({
        effectiveIdentity: {
          id: 'kibana/alertzero_attack_discovery',
          inheritedFrom: { workloadId: 'system-security-floor-attack-discovery-default' },
          type: 'service_account',
        },
        spaceId: 'default',
      })
    ).toBe('workflow:system-security-floor-attack-discovery');
  });

  it('strips a custom space id suffix', () => {
    expect(
      getIdentityGenerationSource({
        effectiveIdentity: {
          id: 'kibana/alertzero_attack_discovery',
          inheritedFrom: { workloadId: 'system-security-floor-attack-discovery-team-a' },
          type: 'service_account',
        },
        spaceId: 'team-a',
      })
    ).toBe('workflow:system-security-floor-attack-discovery');
  });

  it('returns the owning workflow id as is when it has no space suffix', () => {
    expect(
      getIdentityGenerationSource({
        effectiveIdentity: {
          id: 'kibana/alertzero_attack_discovery',
          inheritedFrom: { workloadId: 'system-security-floor-attack-discovery' },
          type: 'service_account',
        },
        spaceId: 'default',
      })
    ).toBe('workflow:system-security-floor-attack-discovery');
  });

  it('does not strip a suffix that only resembles the space id', () => {
    expect(
      getIdentityGenerationSource({
        effectiveIdentity: {
          id: 'kibana/alertzero_attack_discovery',
          inheritedFrom: { workloadId: 'system-security-floor-attack-discoverydefault' },
          type: 'service_account',
        },
        spaceId: 'default',
      })
    ).toBe('workflow:system-security-floor-attack-discoverydefault');
  });

  it('returns undefined when the service account is the workflow’s own run_as', () => {
    expect(
      getIdentityGenerationSource({
        effectiveIdentity: {
          id: 'kibana/alertzero_attack_discovery',
          type: 'service_account',
        },
        spaceId: 'default',
      })
    ).toBeUndefined();
  });

  it('returns undefined when the execution runs as a user', () => {
    expect(
      getIdentityGenerationSource({ effectiveIdentity: undefined, spaceId: 'default' })
    ).toBeUndefined();
  });
});
