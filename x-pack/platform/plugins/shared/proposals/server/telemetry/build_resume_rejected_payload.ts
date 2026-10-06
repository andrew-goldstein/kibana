/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCallerFields } from './build_caller_fields';
import { buildProposalIdFields } from './build_proposal_id_fields';
import type { ProposalResumeRejectedReason } from './constants';
import type { ProposalsProposalResumeRejectedPayload } from './event_types';
import type { ProposalTelemetryRecord } from './types';

/** Describes a refused decision attempt on a stored proposal. */
export const buildResumeRejectedPayload = (
  record: ProposalTelemetryRecord,
  reason: ProposalResumeRejectedReason
): ProposalsProposalResumeRejectedPayload => ({
  ...buildCallerFields(record),
  ...buildProposalIdFields(record),
  reason,
});
