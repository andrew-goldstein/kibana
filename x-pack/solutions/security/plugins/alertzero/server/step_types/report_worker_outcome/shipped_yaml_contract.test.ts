/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import { createWorkflowLiquidEngine } from '@kbn/workflows';
import {
  ALERTZERO_ATTACK_DISCOVERY_REVIEW_WORKFLOW_ID,
  ALERTZERO_ATTACK_DISCOVERY_WORKER_WORKFLOW_ID,
  getManagedWorkflowDefinition,
} from '@kbn/workflows/managed';
import {
  REPORT_WORKER_OUTCOME_EVENTS,
  ReportWorkerOutcomeStepId,
  reportWorkerOutcomeStepInputSchema,
} from '../../../common/step_types';

/**
 * The contract between the shipped Attack Discovery Worker YAML and the report step's input
 * schema. `@kbn/workflows` cannot import this plugin, so this is where each shipped `with` block
 * is rendered the way the engine renders it and validated against the real schema.
 */

interface YamlStep {
  name: string;
  type: string;
  with?: Record<string, unknown>;
  steps?: YamlStep[];
  else?: YamlStep[];
  cases?: Array<{ steps: YamlStep[] }>;
  default?: YamlStep[];
  'on-failure'?: { fallback?: YamlStep[] };
}

const flatten = (steps: YamlStep[]): YamlStep[] =>
  steps.flatMap((step) => [
    step,
    ...flatten(step.steps ?? []),
    ...flatten(step.else ?? []),
    ...flatten(step.default ?? []),
    ...(step.cases ?? []).flatMap((c) => flatten(c.steps)),
    ...flatten(step['on-failure']?.fallback ?? []),
  ]);

const getManagedYaml = (workflowId: string): string => {
  const definition = getManagedWorkflowDefinition(workflowId);
  if (!definition || !('yaml' in definition) || !definition.yaml) {
    throw new Error(`Managed workflow "${workflowId}" has no fixed YAML`);
  }
  return definition.yaml;
};

const reportStepsOf = (workflowId: string): YamlStep[] =>
  flatten((parse(getManagedYaml(workflowId)) as { steps: YamlStep[] }).steps).filter(
    ({ type }) => type === ReportWorkerOutcomeStepId
  );

const runnerReports = reportStepsOf(ALERTZERO_ATTACK_DISCOVERY_WORKER_WORKFLOW_ID);
const reviewReports = reportStepsOf(ALERTZERO_ATTACK_DISCOVERY_REVIEW_WORKFLOW_ID);

// Configured like the engine's templating engine.
const liquid = createWorkflowLiquidEngine({ strictFilters: true, strictVariables: false });

// A whole-value `${{ }}` keeps its type; anything else renders as a string template.
const renderValue = (value: unknown, context: Record<string, unknown>): unknown => {
  if (typeof value === 'string' && value.startsWith('${{') && value.endsWith('}}')) {
    return liquid.evalValueSync(value.slice(3, -2).trim(), context);
  }
  return typeof value === 'string' ? liquid.parseAndRenderSync(value, context) : value;
};

const renderWith = (
  step: YamlStep | undefined,
  context: Record<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(step?.with ?? {}).map(([key, value]) => [key, renderValue(value, context)])
  );

const reportNamed = (steps: YamlStep[], name: string): YamlStep | undefined =>
  steps.find((step) => step.name === name);

const INVESTIGATION_ID = '50e2f8ae-f562-86bd-853f-8e0e1f72b9dd';

const runnerContext = ({
  batchesFailed,
  batchesTotal,
  generated,
  persisted,
}: {
  batchesFailed: number;
  batchesTotal: number;
  generated: number;
  persisted: number;
}): Record<string, unknown> => ({
  steps: {
    resolve_fanout: { output: { attack_count: persisted } },
    run_generation: {
      output: {
        alerts_analyzed: batchesTotal * 100,
        batches_failed: batchesFailed,
        batches_total: batchesTotal,
        discoveries_generated: generated,
      },
    },
  },
});

const reviewContext = ({
  analysisFailed = false,
  rereview = false,
}: {
  analysisFailed?: boolean;
  rereview?: boolean;
} = {}): Record<string, unknown> => ({
  steps: {
    escalation_gate: { output: { decision: 'approved', status: 'succeeded' } },
    open_investigation: rereview
      ? { error: { message: 'conflict' } }
      : { output: { conversation_id: INVESTIGATION_ID } },
    record_decision: { output: { approved: true, declined: false, expired: false } },
    resolve_analysis: { output: { verdict: analysisFailed ? 'failed' : 'true_positive' } },
    resolve_escalation: { output: { auto_approve: false, escalate: true } },
    resolve_investigation_id: { output: { investigation_id: INVESTIGATION_ID } },
    run_fp_tp_analysis: analysisFailed
      ? { error: { message: 'analysis failed' } }
      : { output: { verdict: 'true_positive' } },
  },
});

const parseRendered = (step: YamlStep | undefined, context: Record<string, unknown>) =>
  reportWorkerOutcomeStepInputSchema.safeParse(renderWith(step, context));

describe('shipped Attack Discovery Worker YAML and the reportWorkerOutcome schema', () => {
  // A set, because both review close sites report `ad_worker_investigation_closed`.
  it('reports every event the step supports', () => {
    expect(
      [...new Set([...runnerReports, ...reviewReports].map((step) => step.with?.event))].sort()
    ).toEqual([...REPORT_WORKER_OUTCOME_EVENTS].sort());
  });

  describe('the runner', () => {
    const report = reportNamed(runnerReports, 'report_run_completed');

    it.each([
      ['produced', { batchesFailed: 0, batchesTotal: 3, generated: 5, persisted: 4 }],
      ['empty_no_alerts', { batchesFailed: 0, batchesTotal: 0, generated: 0, persisted: 0 }],
      ['empty_no_attacks', { batchesFailed: 0, batchesTotal: 2, generated: 0, persisted: 0 }],
      ['empty_all_duplicates', { batchesFailed: 0, batchesTotal: 2, generated: 3, persisted: 0 }],
      ['degraded_partial', { batchesFailed: 1, batchesTotal: 3, generated: 2, persisted: 2 }],
      ['failed_all_batches', { batchesFailed: 3, batchesTotal: 3, generated: 0, persisted: 0 }],
    ] as const)('sends a valid %s run_completed', (runOutcome, scenario) => {
      expect(parseRendered(report, runnerContext(scenario))).toEqual({
        data: {
          alerts_analyzed: scenario.batchesTotal * 100,
          attacks_generated: scenario.generated,
          attacks_persisted: scenario.persisted,
          batches_failed: scenario.batchesFailed,
          batches_total: scenario.batchesTotal,
          event: 'ad_worker_run_completed',
          run_outcome: runOutcome,
        },
        success: true,
      });
    });

    it('sends a valid run_completed when the generation output is empty', () => {
      expect(
        parseRendered(report, {
          steps: { resolve_fanout: { output: {} }, run_generation: { output: {} } },
        }).success
      ).toBe(true);
    });
  });

  describe('the review', () => {
    it.each([
      ['a first review', false, false],
      ['a re-review', true, true],
    ])('sends a valid review_started for %s', (_scenario, rereview, expected) => {
      expect(
        parseRendered(
          reportNamed(reviewReports, 'report_review_started'),
          reviewContext({ rereview })
        )
      ).toEqual({
        data: {
          event: 'ad_worker_review_started',
          investigation_id: INVESTIGATION_ID,
          is_rereview: expected,
        },
        success: true,
      });
    });

    it.each([
      ['a completed analysis', false, 'true_positive'],
      ['a failed analysis', true, 'failed'],
    ])('sends a valid analysis_completed for %s', (_scenario, analysisFailed, verdict) => {
      expect(
        parseRendered(
          reportNamed(reviewReports, 'report_analysis_completed'),
          reviewContext({ analysisFailed })
        )
      ).toEqual({
        data: { analysis_error: analysisFailed, event: 'ad_worker_analysis_completed', verdict },
        success: true,
      });
    });

    it.each([
      ['report_investigation_closed_false_positive', 'false_positive'],
      ['report_investigation_closed_declined', 'other'],
    ])('sends a valid investigation_closed from %s', (name, closeReason) => {
      expect(parseRendered(reportNamed(reviewReports, name), reviewContext())).toEqual({
        data: {
          close_reason: closeReason,
          event: 'ad_worker_investigation_closed',
          investigation_id: INVESTIGATION_ID,
        },
        success: true,
      });
    });

    it('sends a valid handoff_resolved', () => {
      expect(
        parseRendered(reportNamed(reviewReports, 'report_handoff_resolved'), reviewContext())
      ).toEqual({
        data: {
          auto_approve_requested: false,
          event: 'ad_worker_handoff_resolved',
          outcome: 'approved',
          verdict: 'true_positive',
        },
        success: true,
      });
    });
  });
});
