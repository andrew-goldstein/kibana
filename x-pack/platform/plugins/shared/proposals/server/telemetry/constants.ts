/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { proposalDecisionSourceSchema } from '@kbn/proposals-common';

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
} as const;

export type ProposalsTelemetryEventType =
  (typeof PROPOSALS_TELEMETRY_EVENTS)[keyof typeof PROPOSALS_TELEMETRY_EVENTS];

/**
 * Shipped as `action_id` when the action workflow is not a managed workflow, so a
 * customer-chosen workflow id never ships.
 */
export const CUSTOM_ACTION_ID = 'custom' as const;

/**
 * Recorded when a decision write carries no `decisionSource` (a gate parked under an older
 * definition, or a direct step call), rather than guessing that a person decided.
 */
export const UNKNOWN_DECISION_SOURCE = 'unknown' as const;

/**
 * Who decided: a person, or the caller's autonomy policy auto-approving the gate. The
 * `decisionSource` step input's own vocabulary, since the reported value is that input as-is,
 * plus `unknown` for a decision recorded without one.
 */
export const DECISION_SOURCES = [
  ...proposalDecisionSourceSchema.options,
  UNKNOWN_DECISION_SOURCE,
] as const;

export type ProposalReportedDecisionSource = (typeof DECISION_SOURCES)[number];

/**
 * Which write settled a proposal outside the decision loop, known only to that write and never
 * stored: `gate` for `proposals.settleIncompleteProposal` (the gate's deadline, its attempt
 * budget, or its workflow-level failure handler), `external` for an expiry
 * `proposals.updateProposal` writes from outside the gate, and `gate_ended` when a read or a
 * decision finds the gate execution cancelled or timed out, which runs no handler.
 */
export const SETTLE_PATHS = ['gate', 'external', 'gate_ended'] as const;

export type ProposalSettlePath = (typeof SETTLE_PATHS)[number];

/**
 * Why a proposal settled as `expired`, derived by the server from the write that settled it:
 * `deadline` when the gate settled it at or after `expiresAt`, `settled_early` when the gate
 * settled it before (its attempt budget ran out, or the gate workflow failed; the gate run's
 * own engine event tells the two apart), `external` for an expiry written outside the gate, and
 * `gate_ended` when the gate execution was cancelled or timed out before anyone decided.
 */
export const EXPIRY_REASONS = ['deadline', 'settled_early', 'external', 'gate_ended'] as const;

export type ProposalExpiryReason = (typeof EXPIRY_REASONS)[number];

/**
 * How much earlier than `expiresAt` a gate settle can land and still count as the deadline:
 * the gate waits in whole seconds, while `expiresAt` keeps the milliseconds.
 */
export const DEADLINE_TOLERANCE_MS = 1_000;

/**
 * Why a proposal settled as `failed`: its action failed, the gate workflow did, or the gate
 * execution was cancelled or timed out while the action ran.
 */
export const FAILURE_SOURCES = ['action', 'workflow_failure', 'gate_ended'] as const;

export type ProposalFailureSource = (typeof FAILURE_SOURCES)[number];

/**
 * Reported as `revision_source` when `revise()` is called without one: an in-process server
 * caller, such as the Hunt Worker adding "Also raised by" to a live proposal.
 */
export const SERVER_API_REVISION_SOURCE = 'server_api' as const;

/**
 * Which surface asked for a revision: the internal revise route, the Agent Builder revise tool,
 * or an in-process server caller.
 */
export const REVISION_SOURCES = ['http_api', 'agent', SERVER_API_REVISION_SOURCE] as const;

export type ProposalRevisionSource = (typeof REVISION_SOURCES)[number];

/** How an approved proposal's action ended. */
export const ACTION_OUTCOMES = ['succeeded', 'failed'] as const;

export type ProposalActionOutcome = (typeof ACTION_OUTCOMES)[number];

/** Why a resume (a decision attempt) was refused. */
export const RESUME_REJECTED_REASONS = [
  'already_decided',
  'settled',
  'past_deadline',
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
