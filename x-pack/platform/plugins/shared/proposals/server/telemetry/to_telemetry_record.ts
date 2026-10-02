/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDocument } from '../storage/proposals_storage';
import type { ProposalTelemetryRecord, ProposalWriteContext } from './types';

/**
 * The payload builders' view of a stored proposal: its public fields, its nested provenance
 * flattened, and what only the write in progress knows. Picked field by field, so the caller
 * free text (`title`, `previousExecutionError`) never reaches a builder.
 */
export const toTelemetryRecord = (
  {
    actionInput,
    actionWorkflowId,
    category,
    comment,
    confidence,
    createdAt,
    decidedAt,
    decision,
    dismissReason,
    expiresAt,
    id,
    impact,
    origin,
    provenance,
    revision,
    rootProposalId,
    spaceId,
    status,
  }: { id: string } & ProposalDocument,
  context: ProposalWriteContext = {}
): ProposalTelemetryRecord => ({
  actionInput,
  actionWorkflowId,
  category,
  comment,
  confidence,
  createdAt,
  decidedAt,
  decision,
  dismissReason,
  expiresAt,
  id,
  impact,
  origin,
  revision,
  rootProposalId,
  spaceId,
  status,
  ...provenance,
  ...context,
});
