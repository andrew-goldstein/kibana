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
 * A pending, undecided proposal in a non-default space, created by a managed caller. Its id
 * differs from its chain root's, as a retry's or a revision's does.
 */
export const telemetryRecord = (
  overrides: Partial<ProposalTelemetryRecord> = {}
): ProposalTelemetryRecord => ({
  actionId: MANAGED_ACTION_ID,
  actionInput: { ruleId: 'rule-1' },
  actionWorkflowId: 'action-workflow-1',
  attempt: 1,
  autoApproveRequested: false,
  callerManaged: true,
  callerRunId: 'exec-root',
  category: 'respond',
  comment: 'Isolate the host',
  confidence: 'high',
  createdAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-09-04T00:00:00.000Z',
  id: 'proposal-2',
  impact: 'medium',
  origin: 'alertzero',
  revision: 1,
  rootProposalId: 'proposal-1',
  spaceId: 'space-a',
  status: 'pending',
  ...overrides,
});

/** The caller fields `telemetryRecord()` resolves to. */
export const MANAGED_CALLER_FIELDS = {
  caller_run_id: 'exec-root',
  is_default_space: false,
  managed_caller: true,
  origin: 'alertzero',
} as const;

/** The proposal id fields `telemetryRecord()` resolves to. */
export const PROPOSAL_ID_FIELDS = {
  proposal_id: 'proposal-2',
  root_proposal_id: 'proposal-1',
} as const;
