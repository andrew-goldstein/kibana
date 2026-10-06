/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readInvestigationStatus } from './read_investigation_status';

const investigation = (metadata?: Record<string, unknown>) => ({
  metadata,
  template_id: 'investigation',
});

describe('readInvestigationStatus', () => {
  it('reads a closed Investigation with its close reason', () => {
    expect(
      readInvestigationStatus(investigation({ close_reason: 'benign', status: 'closed' }))
    ).toEqual({ closeReason: 'benign', status: 'closed', valid: true });
  });

  it('reads a closed Investigation with no close reason', () => {
    expect(readInvestigationStatus(investigation({ status: 'closed' }))).toEqual({
      status: 'closed',
      valid: true,
    });
  });

  it('drops a reopened Investigation stale close reason', () => {
    expect(
      readInvestigationStatus(investigation({ close_reason: 'resolved', status: 'open' }))
    ).toEqual({ status: 'open', valid: true });
  });

  it.each([
    ['an absent status', {}],
    ['an empty status', { status: '' }],
    ['no metadata', undefined],
  ])('reads %s as open, as the template does', (_label, metadata) => {
    expect(readInvestigationStatus(investigation(metadata))).toEqual({
      status: 'open',
      valid: true,
    });
  });

  it('never passes on a close reason outside the template vocabulary', () => {
    expect(
      readInvestigationStatus(investigation({ close_reason: 'Analyst said so', status: 'closed' }))
    ).toEqual({ status: 'closed', valid: true });
  });

  it('skips a status outside the template vocabulary, without echoing it', () => {
    expect(readInvestigationStatus(investigation({ status: 'archived by jdoe' }))).toEqual({
      reason: 'unknown_status',
      valid: false,
    });
  });

  it.each([
    ['another template', { metadata: { status: 'closed' }, template_id: 'escalation' }],
    ['no template', { metadata: { status: 'closed' } }],
  ])('skips a conversation with %s', (_label, conversation) => {
    expect(readInvestigationStatus(conversation)).toEqual({
      reason: 'not_investigation',
      valid: false,
    });
  });
});
