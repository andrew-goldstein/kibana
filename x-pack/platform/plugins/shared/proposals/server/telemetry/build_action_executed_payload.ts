/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCallerFields } from './build_caller_fields';
import { buildProposalIdFields } from './build_proposal_id_fields';
import type { ProposalsActionExecutedPayload } from './event_types';
import { toTelemetryCategory } from './to_telemetry_category';
import type { ProposalTelemetryRecord } from './types';

/**
 * Describes the write that recorded a running action's outcome, or `undefined` for any other
 * write. A failure a settle path wrote onto a running action is the gate's, not the action's,
 * so it reports only its status change.
 */
export const buildActionExecutedPayload = ({
  after,
  before,
  now,
}: {
  after: ProposalTelemetryRecord;
  before: ProposalTelemetryRecord;
  now: number;
}): ProposalsActionExecutedPayload | undefined => {
  const { status } = after;
  if (
    before.status !== 'executing' ||
    (status !== 'succeeded' && status !== 'failed') ||
    after.settledBy !== undefined
  ) {
    return undefined;
  }

  const category = toTelemetryCategory(after.category);
  // `decidedAt` is the approval that started the action.
  const durationMs = after.decidedAt ? now - Date.parse(after.decidedAt) : Number.NaN;

  return {
    ...buildCallerFields(after),
    ...buildProposalIdFields(after),
    ...(after.actionId ? { action_id: after.actionId } : {}),
    attempt: after.attempt ?? 1,
    ...(category ? { category } : {}),
    ...(Number.isFinite(durationMs) && durationMs >= 0
      ? { execution_duration_ms: durationMs }
      : {}),
    outcome: status,
  };
};
