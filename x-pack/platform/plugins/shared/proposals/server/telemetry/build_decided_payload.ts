/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCallerFields } from './build_caller_fields';
import { buildProposalIdFields } from './build_proposal_id_fields';
import { UNKNOWN_DECISION_SOURCE } from './constants';
import type { ProposalsProposalDecidedPayload } from './event_types';
import type { ProposalTelemetryRecord } from './types';

/**
 * Describes the write that first recorded a decision, or `undefined` when the write recorded
 * none. A decision stored without a source (a gate parked under an older definition, or a
 * direct step call) reads as `unknown` rather than a guessed `human`.
 */
export const buildDecidedPayload = ({
  after,
  before,
}: {
  after: ProposalTelemetryRecord;
  before: ProposalTelemetryRecord;
}): ProposalsProposalDecidedPayload | undefined => {
  const { decidedAt, decision } = after;
  if (before.decision !== undefined || decision === undefined || decidedAt === undefined) {
    return undefined;
  }

  const decisionSource = after.decisionSource ?? UNKNOWN_DECISION_SOURCE;
  const decidedAtMs = Date.parse(decidedAt);
  const expiresAtMs = after.expiresAt ? Date.parse(after.expiresAt) : Number.NaN;
  // Retries and revisions inherit the chain root's `createdAt`, so this measures from the root.
  const timeToDecisionMs = decidedAtMs - Date.parse(after.createdAt);

  return {
    ...buildCallerFields(after),
    ...buildProposalIdFields(after),
    attempt: after.attempt ?? 1,
    decided_after_deadline: Number.isFinite(expiresAtMs) && decidedAtMs > expiresAtMs,
    decision,
    decision_source: decisionSource,
    ...(decision === 'dismissed' && after.dismissReason
      ? { dismiss_reason: after.dismissReason }
      : {}),
    ...(decisionSource === 'human' && Number.isFinite(timeToDecisionMs) && timeToDecisionMs >= 0
      ? { time_to_decision_ms: timeToDecisionMs }
      : {}),
  };
};
