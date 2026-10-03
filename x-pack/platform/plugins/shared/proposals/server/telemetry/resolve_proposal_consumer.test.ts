/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { resolveProposalConsumer } from './resolve_proposal_consumer';

describe('resolveProposalConsumer', () => {
  it("ships a managed caller's owner as the consumer", () => {
    expect(resolveProposalConsumer('alertzero')).toEqual({
      consumer: 'alertzero',
      managed_caller: true,
    });
  });

  it('ships `custom` when the caller is not managed', () => {
    expect(resolveProposalConsumer(undefined)).toEqual({
      consumer: 'custom',
      managed_caller: false,
    });
  });

  it('treats an empty owner as unmanaged, as Liquid renders an absent value', () => {
    expect(resolveProposalConsumer('')).toEqual({
      consumer: 'custom',
      managed_caller: false,
    });
  });
});
