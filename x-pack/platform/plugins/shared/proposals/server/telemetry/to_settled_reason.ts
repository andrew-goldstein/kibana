/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalSettledReason } from './constants';
import { EXPIRY_REASONS } from './constants';
import type { ProposalSettledStatus } from './event_types';

const isExpiryReason = (settledBy: string): settledBy is (typeof EXPIRY_REASONS)[number] =>
  (EXPIRY_REASONS as readonly string[]).includes(settledBy);

/**
 * Why a settled chain head ended where it did, from its stored `settledBy`, matching the
 * `expiry_reason` and `failure_source` the per-write events send. An `expired` head without a
 * known settle path (a gate parked under an older definition) has no reason, and a `failed` one
 * without any settle path failed in its own action.
 */
export const toSettledReason = ({
  settledBy,
  status,
}: {
  settledBy: string | undefined;
  status: ProposalSettledStatus;
}): ProposalSettledReason | undefined => {
  if (status === 'expired') {
    return settledBy !== undefined && isExpiryReason(settledBy) ? settledBy : undefined;
  }
  if (status === 'failed') {
    return settledBy === undefined ? 'action' : 'workflow_failure';
  }
  return undefined;
};
