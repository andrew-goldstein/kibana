/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Closed vocabularies for the Worker outcome events: the Attack Discovery Worker's own, and the
 * Investigation close reasons any Worker reports. They live in `common` so the server event types
 * and the report step's input schema share one definition.
 */

/** How an Attack Discovery Worker run ended, as far as its own outputs can tell. */
export const AD_WORKER_RUN_OUTCOMES = [
  'produced',
  'empty_no_alerts',
  'empty_no_attacks',
  'empty_all_duplicates',
  'degraded_partial',
  'failed_all_batches',
] as const;

export type AdWorkerRunOutcome = (typeof AD_WORKER_RUN_OUTCOMES)[number];

/** The FP/TP analysis verdict of one reviewed attack; `failed` covers errors and timeouts. */
export const AD_WORKER_ANALYSIS_VERDICTS = [
  'true_positive',
  'false_positive',
  'inconclusive',
  'failed',
] as const;

export type AdWorkerAnalysisVerdict = (typeof AD_WORKER_ANALYSIS_VERDICTS)[number];

/** How a completed escalation gate resolved the forensics handoff. */
export const AD_WORKER_HANDOFF_OUTCOMES = [
  'approved',
  'dismissed',
  'expired',
  'approved_action_failed',
] as const;

export type AdWorkerHandoffOutcome = (typeof AD_WORKER_HANDOFF_OUTCOMES)[number];

/**
 * Mirrors the `investigation` conversation template's `close_reason` SELECT options, which Agent
 * Builder declares inline in its server plugin and does not export.
 */
export const INVESTIGATION_CLOSE_REASONS = [
  'false_positive',
  'benign',
  'resolved',
  'duplicate',
  'other',
] as const;

export type InvestigationCloseReason = (typeof INVESTIGATION_CLOSE_REASONS)[number];

/** The `investigation` conversation template's `status` values. An absent status reads as `open`. */
export const INVESTIGATION_STATUSES = ['open', 'closed'] as const;

export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

/**
 * Who wrote an Investigation status change, from the `ai.conversation.updated` trigger's `source`:
 * `agent` for an agent execution, `workflow` for an Agent Builder workflow step, and `api` for the
 * Agent Builder HTTP APIs.
 */
export const INVESTIGATION_STATUS_WRITERS = ['agent', 'workflow', 'api'] as const;

export type InvestigationStatusWriter = (typeof INVESTIGATION_STATUS_WRITERS)[number];
