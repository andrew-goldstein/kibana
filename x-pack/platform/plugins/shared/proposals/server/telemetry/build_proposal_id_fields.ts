/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalsProposalIdFields } from './event_types';
import type { ProposalTelemetryRecord } from './types';

/**
 * The proposal's own id and its chain root's. A record written before chain roots were stored
 * has no `rootProposalId`, so it reads as its own root.
 */
export const buildProposalIdFields = ({
  id,
  rootProposalId,
}: Pick<ProposalTelemetryRecord, 'id' | 'rootProposalId'>): ProposalsProposalIdFields => ({
  proposal_id: id,
  root_proposal_id: rootProposalId ?? id,
});
