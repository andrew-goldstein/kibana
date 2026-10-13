/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalsProposalIdFields } from './event_types';
import type { ProposalTelemetryRecord } from './types';

/**
 * The proposal's own id, its chain root's and its conversation's.
 */
export const buildProposalIdFields = ({
  conversationId,
  id,
  rootProposalId,
}: Pick<
  ProposalTelemetryRecord,
  'conversationId' | 'id' | 'rootProposalId'
>): ProposalsProposalIdFields => ({
  conversation_id: conversationId,
  proposal_id: id,
  root_proposal_id: rootProposalId,
});
