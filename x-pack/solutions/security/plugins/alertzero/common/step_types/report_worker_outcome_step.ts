/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { BaseStepDefinition } from '@kbn/workflows';
import { StepCategory } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import {
  AD_WORKER_ANALYSIS_VERDICTS,
  AD_WORKER_HANDOFF_OUTCOMES,
  AD_WORKER_RUN_OUTCOMES,
  INVESTIGATION_CLOSE_REASONS,
} from '../telemetry/constants';

export const ReportWorkerOutcomeStepId = 'alertzero.reportWorkerOutcome' as const;

/** The Worker outcome events the step can report; each maps to `alertzero_<event>`. */
export const REPORT_WORKER_OUTCOME_EVENTS = [
  'ad_worker_run_completed',
  'ad_worker_review_started',
  'ad_worker_analysis_completed',
  'ad_worker_handoff_resolved',
  'ad_worker_investigation_closed',
] as const;

export type ReportWorkerOutcomeEvent = (typeof REPORT_WORKER_OUTCOME_EVENTS)[number];

/** Upper bound for every reported count, far above any real Worker run. */
export const MAX_REPORTED_COUNT = 1_000_000;

const INTEGER_STRING = /^\d+$/;

/** Liquid renders a missing value as `''`; treat it (and `null`) as absent. */
const toAbsent = (value: unknown): unknown => (value === '' || value === null ? undefined : value);

/** Also accepts the integer text a `{{ }}` template renders. */
const toCount = (value: unknown): unknown => {
  const present = toAbsent(value);
  return typeof present === 'string' && INTEGER_STRING.test(present) ? Number(present) : present;
};

/** Also accepts the `true` / `false` text a `{{ }}` template renders. */
const toFlag = (value: unknown): unknown => {
  const present = toAbsent(value);
  if (present === 'true') {
    return true;
  }
  if (present === 'false') {
    return false;
  }
  return present;
};

const count = (description: string) =>
  z
    .preprocess(toCount, z.number().int().min(0).max(MAX_REPORTED_COUNT).default(0))
    .describe(description);

const flag = (description: string) =>
  z.preprocess(toFlag, z.boolean().default(false)).describe(description);

const optionalFlag = (description: string) =>
  z.preprocess(toFlag, z.boolean().optional()).describe(description);

const optionalVerdict = (description: string) =>
  z.preprocess(toAbsent, z.enum(AD_WORKER_ANALYSIS_VERDICTS).optional()).describe(description);

const adWorkerRunCompletedInputSchema = z.strictObject({
  event: z.literal('ad_worker_run_completed'),
  alerts_analyzed: count('Alerts the run analyzed'),
  attacks_generated: count('Attacks the run generated, before de-duplication'),
  attacks_persisted: count('Attacks the run persisted'),
  batches_failed: count('Generation batches that failed'),
  batches_total: count('Generation batches the run attempted'),
  run_outcome: z.enum(AD_WORKER_RUN_OUTCOMES).describe('How the run ended'),
});

const adWorkerReviewStartedInputSchema = z.strictObject({
  event: z.literal('ad_worker_review_started'),
  investigation_id: z
    .preprocess(toAbsent, z.uuid().optional())
    .describe('Investigation the review opened or reused'),
  is_rereview: optionalFlag('Whether the attack already had an Investigation'),
});

const adWorkerAnalysisCompletedInputSchema = z.strictObject({
  event: z.literal('ad_worker_analysis_completed'),
  analysis_error: flag('Whether the FP/TP analysis failed or timed out'),
  verdict: z.enum(AD_WORKER_ANALYSIS_VERDICTS).describe('FP/TP analysis verdict'),
});

const adWorkerHandoffResolvedInputSchema = z.strictObject({
  event: z.literal('ad_worker_handoff_resolved'),
  auto_approve_requested: optionalFlag('Whether the review asked the gate to auto-approve'),
  outcome: z.enum(AD_WORKER_HANDOFF_OUTCOMES).describe('How the escalation gate resolved'),
  verdict: optionalVerdict('FP/TP analysis verdict that led to the escalation'),
});

const adWorkerInvestigationClosedInputSchema = z.strictObject({
  event: z.literal('ad_worker_investigation_closed'),
  close_reason: z
    .enum(INVESTIGATION_CLOSE_REASONS)
    .describe('Investigation template close reason the review wrote'),
  investigation_id: z.preprocess(toAbsent, z.uuid()).describe('Investigation the review closed'),
});

/**
 * A closed union of the Attack Discovery Worker outcomes: enums, bounded counts and flags only, so
 * a Worker YAML cannot ship free text or ids other than its own Investigation id.
 */
export const reportWorkerOutcomeStepInputSchema = z.discriminatedUnion('event', [
  adWorkerRunCompletedInputSchema,
  adWorkerReviewStartedInputSchema,
  adWorkerAnalysisCompletedInputSchema,
  adWorkerHandoffResolvedInputSchema,
  adWorkerInvestigationClosedInputSchema,
]);

export type ReportWorkerOutcomeStepInput = z.output<typeof reportWorkerOutcomeStepInputSchema>;

export const reportWorkerOutcomeStepOutputSchema = z.object({
  reported: z.boolean().describe('Whether the outcome event was reported'),
});

export const reportWorkerOutcomeStepCommonDefinition: BaseStepDefinition<
  typeof reportWorkerOutcomeStepInputSchema,
  typeof reportWorkerOutcomeStepOutputSchema
> = {
  id: ReportWorkerOutcomeStepId,
  label: i18n.translate('xpack.alertzero.steps.reportWorkerOutcome.label', {
    defaultMessage: 'Report AlertZero Worker outcome',
  }),
  description: i18n.translate('xpack.alertzero.steps.reportWorkerOutcome.description', {
    defaultMessage:
      'Reports an allowlisted AlertZero Worker outcome as product telemetry. Only a managed AlertZero Worker run reports; any other caller is skipped.',
  }),
  category: StepCategory.Kibana,
  stability: 'beta',
  inputSchema: reportWorkerOutcomeStepInputSchema,
  outputSchema: reportWorkerOutcomeStepOutputSchema,
  documentation: {
    details: i18n.translate('xpack.alertzero.steps.reportWorkerOutcome.documentation.details', {
      defaultMessage:
        'The step never fails the workflow. It returns reported: false when the run is a test run, is not part of a managed AlertZero Worker run, the input does not match the event schema, or telemetry could not be reported. Run with on-failure continue and a short timeout.',
    }),
    examples: [
      `- name: report_run_completed
  type: ${ReportWorkerOutcomeStepId}
  timeout: 30s
  on-failure:
    continue: true
  with:
    event: ad_worker_run_completed
    alerts_analyzed: \${{ steps.count_alerts.output.count | default: 0 }}
    batches_total: \${{ steps.plan_batches.output.total | default: 0 }}
    batches_failed: \${{ steps.plan_batches.output.failed | default: 0 }}
    attacks_generated: \${{ steps.generate.output.generated | default: 0 }}
    attacks_persisted: \${{ steps.persist.output.persisted | default: 0 }}
    run_outcome: produced`,
    ],
  },
};
