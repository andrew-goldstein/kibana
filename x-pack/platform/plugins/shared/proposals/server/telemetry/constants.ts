/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalStatus } from '@kbn/proposals-common';

export const PROPOSALS_TELEMETRY_PREFIX = 'proposals';

/** Every proposals EBT event type, named `<plugin>_<object>_<verb>`. */
export const PROPOSALS_TELEMETRY_EVENTS = {
  ProposalCreated: `${PROPOSALS_TELEMETRY_PREFIX}_proposal_created`,
  ProposalDecided: `${PROPOSALS_TELEMETRY_PREFIX}_proposal_decided`,
  ProposalStatusChanged: `${PROPOSALS_TELEMETRY_PREFIX}_proposal_status_changed`,
  ActionExecuted: `${PROPOSALS_TELEMETRY_PREFIX}_action_executed`,
  ProposalRevised: `${PROPOSALS_TELEMETRY_PREFIX}_proposal_revised`,
  ProposalRetried: `${PROPOSALS_TELEMETRY_PREFIX}_proposal_retried`,
  ProposalResumeRejected: `${PROPOSALS_TELEMETRY_PREFIX}_proposal_resume_rejected`,
  Snapshot: `${PROPOSALS_TELEMETRY_PREFIX}_snapshot`,
} as const;

export type ProposalsTelemetryEventType =
  (typeof PROPOSALS_TELEMETRY_EVENTS)[keyof typeof PROPOSALS_TELEMETRY_EVENTS];

/** Shipped as `consumer` when the calling workflow is not a managed workflow. */
export const CUSTOM_CONSUMER = 'custom' as const;

/**
 * Shipped as `action_id` when the action workflow is not a managed workflow, so a
 * customer-chosen workflow id never ships.
 */
export const CUSTOM_ACTION_ID = 'custom' as const;

/** Who decided: a person, or the caller's autonomy policy auto-approving the gate. */
export const DECISION_SOURCES = ['human', 'autonomy'] as const;

export type ProposalDecisionSource = (typeof DECISION_SOURCES)[number];

/** Why a proposal settled as `expired`, passed to the settle step by the gate workflow. */
export const EXPIRY_REASONS = ['deadline', 'iteration_limit', 'workflow_failure'] as const;

export type ProposalExpiryReason = (typeof EXPIRY_REASONS)[number];

/** Why a proposal settled as `failed`: its action failed, or the gate workflow did. */
export const FAILURE_SOURCES = ['action', 'workflow_failure'] as const;

export type ProposalFailureSource = (typeof FAILURE_SOURCES)[number];

/** How an approved proposal's action ended. */
export const ACTION_OUTCOMES = ['succeeded', 'failed'] as const;

export type ProposalActionOutcome = (typeof ACTION_OUTCOMES)[number];

/** Why a resume (a decision attempt) was refused. */
export const RESUME_REJECTED_REASONS = [
  'expired',
  'already_decided',
  'settled',
  'input_changed',
  'not_waiting',
  'no_execution',
  'unprivileged',
  'external_principal',
] as const;

export type ProposalResumeRejectedReason = (typeof RESUME_REJECTED_REASONS)[number];

/** Upper-inclusive duration buckets, so the default 72h deadline lands in `le_72h`. */
export const DURATION_BUCKETS = ['le_1h', 'le_24h', 'le_72h', 'le_7d', 'gt_7d'] as const;

export type ProposalDurationBucket = (typeof DURATION_BUCKETS)[number];

/** Shipped as `expires_in_bucket` when a proposal has no deadline. */
export const NO_DEADLINE_BUCKET = 'none' as const;

export const EXPIRES_IN_BUCKETS = [NO_DEADLINE_BUCKET, ...DURATION_BUCKETS] as const;

export type ProposalExpiresInBucket = (typeof EXPIRES_IN_BUCKETS)[number];

/** Shipped as `category` for any action category outside the known vocabulary. */
export const OTHER_CATEGORY = 'other' as const;

/**
 * The action categories shipped as-is. The category is an open keyword that each solution
 * declares on its actions (and a caller may override), so anything else ships as `other`.
 */
export const KNOWN_CATEGORIES = ['configure', 'investigate', 'respond'] as const;

export const TELEMETRY_CATEGORIES = [...KNOWN_CATEGORIES, OTHER_CATEGORY] as const;

export type ProposalTelemetryCategory = (typeof TELEMETRY_CATEGORIES)[number];

/**
 * Why a snapshot's settled proposal ended where it did: an expiry reason (for `expired`) or a
 * failure source (for `failed`). `workflow_failure` belongs to both.
 */
export const SETTLED_REASONS = [
  'deadline',
  'iteration_limit',
  'workflow_failure',
  'action',
] as const;

export type ProposalSettledReason = (typeof SETTLED_REASONS)[number];

/** The settled statuses a chain head can hold, in the order the snapshot lists them. */
export const SETTLED_STATUSES = [
  'succeeded',
  'failed',
  'expired',
  'no_action',
] as const satisfies ReadonlyArray<ProposalStatus>;
