/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCallerFields } from './build_caller_fields';
import { buildProposalIdFields } from './build_proposal_id_fields';
import type { ProposalsProposalStatusChangedPayload } from './event_types';
import type { ProposalTelemetryRecord } from './types';

/**
 * Describes a real status transition, or `undefined` for a same-status rewrite or a move to
 * `superseded` (a revision or retry reports its own event). `settledBy` is stored only by the
 * write that settles a proposal outside the loop, so a `failed` without one is the action's own.
 */
export const buildStatusChangedPayload = ({
  after,
  before,
}: {
  after: ProposalTelemetryRecord;
  before: ProposalTelemetryRecord;
}): ProposalsProposalStatusChangedPayload | undefined => {
  if (after.status === before.status || after.status === 'superseded') {
    return undefined;
  }

  const { settledBy } = after;
  return {
    ...buildCallerFields(after),
    ...buildProposalIdFields(after),
    ...(after.status === 'expired' && settledBy ? { expiry_reason: settledBy } : {}),
    ...(after.status === 'failed'
      ? { failure_source: settledBy === undefined ? 'action' : 'workflow_failure' }
      : {}),
    from_status: before.status,
    to_status: after.status,
  };
};
