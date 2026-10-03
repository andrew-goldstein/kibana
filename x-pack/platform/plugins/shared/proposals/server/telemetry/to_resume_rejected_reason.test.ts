/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ProposalConflictError,
  ProposalExpiredError,
  ProposalNotFoundError,
} from '../services/errors';
import { toResumeRejectedReason } from './to_resume_rejected_reason';

describe('toResumeRejectedReason', () => {
  it('reads an expired proposal as expired', () => {
    expect(toResumeRejectedReason(new ProposalExpiredError('proposal-1'))).toBe('expired');
  });

  it.each(['already_decided', 'settled', 'input_changed', 'not_waiting', 'no_execution'] as const)(
    'reads a %s conflict as its reason',
    (reason) => {
      expect(toResumeRejectedReason(new ProposalConflictError('refused', { reason }))).toBe(reason);
    }
  );

  it('ignores a conflict without a resume reason, such as a lost write race', () => {
    expect(toResumeRejectedReason(new ProposalConflictError('lost the race'))).toBeUndefined();
  });

  it.each([
    ['a missing proposal', new ProposalNotFoundError('proposal-1')],
    ['an untyped failure', new Error('resume API unavailable')],
    ['a non-error', 'boom'],
  ])('ignores %s', (_label, error) => {
    expect(toResumeRejectedReason(error)).toBeUndefined();
  });
});
