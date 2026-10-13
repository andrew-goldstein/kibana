/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { bucketExpiresIn } from './bucket_expires_in';
import { buildCallerFields } from './build_caller_fields';
import { buildProposalIdFields } from './build_proposal_id_fields';
import type { ProposalsProposalCreatedPayload } from './event_types';
import { toTelemetryCategory } from './to_telemetry_category';
import type { ProposalTelemetryRecord } from './types';

/**
 * Describes a newly stored proposal by its generated ids, enums and flags, never its text or
 * its action workflow's own id: the action ships only as the `actionId` resolved at creation.
 */
export const buildCreatedPayload = (
  record: ProposalTelemetryRecord
): ProposalsProposalCreatedPayload => {
  const category = toTelemetryCategory(record.category);
  return {
    ...buildCallerFields(record),
    ...buildProposalIdFields(record),
    ...(record.actionId ? { action_id: record.actionId } : {}),
    auto_approve_requested: record.autoApproveRequested ?? false,
    ...(category ? { category } : {}),
    confidence_bucket: record.confidence,
    expires_in_bucket: bucketExpiresIn(record),
    has_action: record.actionWorkflowId !== undefined,
    impact_class: record.impact,
  };
};
