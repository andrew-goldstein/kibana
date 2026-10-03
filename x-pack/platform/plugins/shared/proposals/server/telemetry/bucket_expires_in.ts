/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { bucketDuration } from './bucket_duration';
import type { ProposalExpiresInBucket } from './constants';
import { NO_DEADLINE_BUCKET } from './constants';

/** Buckets the decision window a proposal was created with, from its stored timestamps. */
export const bucketExpiresIn = ({
  createdAt,
  expiresAt,
}: {
  createdAt: string;
  expiresAt?: string;
}): ProposalExpiresInBucket => {
  if (!expiresAt) {
    return NO_DEADLINE_BUCKET;
  }
  const windowMs = Date.parse(expiresAt) - Date.parse(createdAt);
  return Number.isFinite(windowMs) ? bucketDuration(windowMs) : NO_DEADLINE_BUCKET;
};
