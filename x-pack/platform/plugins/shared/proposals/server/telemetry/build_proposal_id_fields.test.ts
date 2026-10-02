/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildProposalIdFields } from './build_proposal_id_fields';

describe('buildProposalIdFields', () => {
  it('ships the proposal id and its chain root', () => {
    expect(buildProposalIdFields({ id: 'proposal-2', rootProposalId: 'proposal-1' })).toEqual({
      proposal_id: 'proposal-2',
      root_proposal_id: 'proposal-1',
    });
  });

  it('reads a chain root as its own root', () => {
    expect(buildProposalIdFields({ id: 'proposal-1', rootProposalId: 'proposal-1' })).toEqual({
      proposal_id: 'proposal-1',
      root_proposal_id: 'proposal-1',
    });
  });

  it('reads a record stored before chain roots existed as its own root', () => {
    expect(buildProposalIdFields({ id: 'proposal-1' })).toEqual({
      proposal_id: 'proposal-1',
      root_proposal_id: 'proposal-1',
    });
  });
});
