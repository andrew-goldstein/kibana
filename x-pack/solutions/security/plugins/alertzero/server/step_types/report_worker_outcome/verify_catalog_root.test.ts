/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { verifyCatalogRoot } from './verify_catalog_root';
import { ROOT_EXECUTION_ID, createAttackDiscoveryChain } from './worker_chain.mock';

const root = createAttackDiscoveryChain()[ROOT_EXECUTION_ID];

describe('verifyCatalogRoot', () => {
  it('verifies a root whose origin is a catalog Worker', () => {
    expect(verifyCatalogRoot(root)).toEqual({
      root: expect.objectContaining({ id: ROOT_EXECUTION_ID }),
      verified: true,
    });
  });

  it('keeps only the root fields the envelope reads', () => {
    const result = verifyCatalogRoot(root);

    expect(result.verified && Object.keys(result.root).sort()).toEqual([
      'context',
      'id',
      'originManagedWorkflowId',
      'spaceId',
      'triggeredBy',
      'workflowDefinition',
    ]);
  });

  it('keeps only the consts of the root definition', () => {
    const result = verifyCatalogRoot(root);

    expect(result.verified && result.root.workflowDefinition).toEqual({
      consts: { worker_settings: { autonomy: 'assisted' } },
    });
  });

  it.each([
    ['outside the Worker catalog', 'custom-workflow'],
    ['with no origin managed workflow', null],
    ['with an undefined origin managed workflow', undefined],
  ])('rejects a root %s', (_label, originManagedWorkflowId) => {
    expect(verifyCatalogRoot({ ...root, originManagedWorkflowId })).toEqual({
      reason: 'not_catalog_root',
      verified: false,
    });
  });
});
