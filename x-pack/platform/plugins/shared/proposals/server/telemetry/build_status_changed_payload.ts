/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCommonFields } from './build_common_fields';
import { buildProposalIdFields } from './build_proposal_id_fields';
import type { ProposalsProposalStatusChangedPayload } from './event_types';
import { toExpiryReason } from './to_expiry_reason';
import { toFailureSource } from './to_failure_source';
import type { ProposalTelemetryRecord } from './types';

/**
 * Describes a real status transition, or `undefined` for a same-status rewrite or a move to
 * `superseded` (a revision or retry reports its own event). Only the write that settles a
 * proposal outside the loop carries a settle path, so a `failed` without one is the action's own.
 */
export const buildStatusChangedPayload = ({
  after,
  before,
  now,
}: {
  after: ProposalTelemetryRecord;
  before: ProposalTelemetryRecord;
  now: number;
}): ProposalsProposalStatusChangedPayload | undefined => {
  if (after.status === before.status || after.status === 'superseded') {
    return undefined;
  }

  const { expiresAt, settlePath } = after;
  const expiryReason =
    after.status === 'expired' ? toExpiryReason({ expiresAt, now, settlePath }) : undefined;
  return {
    ...buildCommonFields(after),
    ...buildProposalIdFields(after),
    ...(expiryReason ? { expiry_reason: expiryReason } : {}),
    ...(after.status === 'failed' ? { failure_source: toFailureSource(settlePath) } : {}),
    from_status: before.status,
    to_status: after.status,
  };
};
