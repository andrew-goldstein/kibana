/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildActionExecutedPayload } from './build_action_executed_payload';
import { buildDecidedPayload } from './build_decided_payload';
import { buildStatusChangedPayload } from './build_status_changed_payload';
import { PROPOSALS_TELEMETRY_EVENTS } from './constants';
import type { ProposalsTelemetryEvent, ProposalTelemetryRecord } from './types';

/**
 * The events one `update()` write produces, diffed from the loaded record to the written one:
 * at most one of each type, and none for an idempotent rewrite or an annotation.
 */
export const buildUpdateEvents = ({
  after,
  before,
  now,
}: {
  after: ProposalTelemetryRecord;
  before: ProposalTelemetryRecord;
  now: number;
}): ProposalsTelemetryEvent[] => {
  const decided = buildDecidedPayload({ after, before });
  const statusChanged = buildStatusChangedPayload({ after, before });
  const actionExecuted = buildActionExecutedPayload({ after, before, now });

  return [
    ...(decided
      ? [{ eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalDecided, payload: decided }]
      : []),
    ...(statusChanged
      ? [{ eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged, payload: statusChanged }]
      : []),
    ...(actionExecuted
      ? [{ eventType: PROPOSALS_TELEMETRY_EVENTS.ActionExecuted, payload: actionExecuted }]
      : []),
  ];
};
