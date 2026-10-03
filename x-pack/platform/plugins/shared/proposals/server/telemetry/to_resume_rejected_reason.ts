/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ProposalConflictError, ProposalExpiredError } from '../services/errors';
import type { ProposalResumeRejectedReason } from './constants';

/**
 * The resume refusal an error stands for, or `undefined` for any failure that is not one: a
 * missing proposal, a lost write race, or the resume API failing.
 */
export const toResumeRejectedReason = (
  error: unknown
): ProposalResumeRejectedReason | undefined => {
  if (error instanceof ProposalExpiredError) {
    return 'expired';
  }
  return error instanceof ProposalConflictError ? error.reason : undefined;
};
