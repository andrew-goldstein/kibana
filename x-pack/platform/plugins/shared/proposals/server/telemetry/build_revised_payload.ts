/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual } from 'lodash';
import { buildCallerFields } from './build_caller_fields';
import { buildProposalIdFields } from './build_proposal_id_fields';
import type { ProposalsProposalRevisedPayload } from './event_types';
import type { ProposalTelemetryRecord } from './types';

/** Describes which parts of a proposal a revision changed, never the values themselves. */
export const buildRevisedPayload = ({
  original,
  revision,
}: {
  original: ProposalTelemetryRecord;
  revision: ProposalTelemetryRecord;
}): ProposalsProposalRevisedPayload => ({
  ...buildCallerFields(revision),
  ...buildProposalIdFields(revision),
  action_input_changed: !isEqual(original.actionInput, revision.actionInput),
  comment_changed: original.comment !== revision.comment,
  confidence_changed: original.confidence !== revision.confidence,
  impact_changed: original.impact !== revision.impact,
  revision: revision.revision ?? 1,
});
