/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCallerFields } from './build_caller_fields';
import { buildProposalIdFields } from './build_proposal_id_fields';
import type { ProposalsProposalRetriedPayload } from './event_types';
import type { ProposalTelemetryRecord } from './types';

/** Describes the clone that re-offers a proposal whose action failed. */
export const buildRetriedPayload = (
  clone: ProposalTelemetryRecord
): ProposalsProposalRetriedPayload => ({
  ...buildCallerFields(clone),
  ...buildProposalIdFields(clone),
  attempt: clone.attempt ?? 1,
});
