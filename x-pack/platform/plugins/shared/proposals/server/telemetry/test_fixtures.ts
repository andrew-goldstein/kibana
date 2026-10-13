/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalTelemetryRecord } from './types';

/** The managed definition id `telemetryRecord()`'s action workflow was installed from. */
export const MANAGED_ACTION_ID = 'security-isolate-host';

/**
 * A pending, undecided proposal in a non-default space, created in a gate execution. Its id
 * differs from its chain root's, as a retry's or a revision's does.
 */
export const telemetryRecord = (
  overrides: Partial<ProposalTelemetryRecord> = {}
): ProposalTelemetryRecord => ({
  actionId: MANAGED_ACTION_ID,
  actionInput: { ruleId: 'rule-1' },
  actionWorkflowId: 'action-workflow-1',
  category: 'respond',
  comment: 'Isolate the host',
  confidence: 'high',
  conversationId: 'conversation-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-09-04T00:00:00.000Z',
  id: 'proposal-2',
  impact: 'medium',
  origin: 'alertzero',
  revision: 1,
  rootProposalId: 'proposal-1',
  spaceId: 'space-a',
  status: 'pending',
  workflowExecutionId: 'exec-gate',
  ...overrides,
});

/** The common fields `telemetryRecord()` resolves to. */
export const COMMON_FIELDS = {
  is_default_space: false,
  origin: 'alertzero',
  workflow_execution_id: 'exec-gate',
} as const;

/** The proposal id fields `telemetryRecord()` resolves to. */
export const PROPOSAL_ID_FIELDS = {
  conversation_id: 'conversation-1',
  proposal_id: 'proposal-2',
  root_proposal_id: 'proposal-1',
} as const;
