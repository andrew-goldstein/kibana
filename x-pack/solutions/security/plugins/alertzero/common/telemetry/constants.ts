/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Closed vocabularies for the Attack Discovery Worker outcome events. They live in `common` so the
 * server event types and the report step's input schema share one definition.
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
