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
 * known settle path (a gate parked under an older definition) has no reason. A `failed` one
 * without any settle path failed in its own action, unless it was written before provenance
 * existed (`hasProvenance: false`): then any path could have settled it, so it has no reason.
 */
export const toSettledReason = ({
  hasProvenance,
  settledBy,
  status,
}: {
  hasProvenance: boolean;
  settledBy: string | undefined;
  status: ProposalSettledStatus;
}): ProposalSettledReason | undefined => {
  if (status === 'expired') {
    return settledBy !== undefined && isExpiryReason(settledBy) ? settledBy : undefined;
  }
  if (status === 'failed') {
    if (settledBy !== undefined) {
      return 'workflow_failure';
    }
    return hasProvenance ? 'action' : undefined;
  }
  return undefined;
};
