/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalExpiryReason, ProposalSettlePath } from './constants';
import { DEADLINE_TOLERANCE_MS } from './constants';

/**
 * Why a write expired a proposal, from what that write knows: who settled it, and when against
 * its deadline. `undefined` for an expiry no settle path wrote.
 */
export const toExpiryReason = ({
  expiresAt,
  now,
  settlePath,
}: {
  expiresAt?: string;
  now: number;
  settlePath?: ProposalSettlePath;
}): ProposalExpiryReason | undefined => {
  if (settlePath === undefined) {
    return undefined;
  }
  if (settlePath === 'external' || settlePath === 'gate_ended') {
    return settlePath;
  }
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return Number.isFinite(expiresAtMs) && now >= expiresAtMs - DEADLINE_TOLERANCE_MS
    ? 'deadline'
    : 'settled_early';
};
