/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import { createAnalytics } from '@elastic/ebt/client';
import { loggerMock } from '@kbn/logging-mocks';
import { createWorkflowLiquidEngine } from '@kbn/workflows';
import {
  ALERTZERO_ATTACK_DISCOVERY_REVIEW_WORKFLOW_ID,
  ALERTZERO_ATTACK_DISCOVERY_WORKER_WORKFLOW_ID,
  getManagedWorkflowDefinition,
} from '@kbn/workflows/managed';
import { SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID } from '@kbn/alertzero-common';
import {
  REPORT_WORKER_OUTCOME_EVENTS,
  ReportWorkerOutcomeStepId,
  reportWorkerOutcomeStepInputSchema,
} from '../../../common/step_types';
import type { AlertZeroEnvelope } from '../../telemetry';
import {
  createAlertZeroTelemetryReporter,
  registerAlertZeroTelemetryEvents,
  resolveWorkerCatalogFields,
} from '../../telemetry';
import { EVENT_WORKER_IDS, isEventFromItsWorker } from './event_worker_ids';
import { reportOutcome } from './report_outcome';

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

/**
 * Reports a rendered `with` block the way the step does, on top of an envelope for `workerId`,
 * through an analytics client in dev mode, which rejects any payload its registered schema does
 * not allow. Returns the reported event, or `undefined` when the input or the payload was rejected.
 */
const reportOnDevModeClient = (
  step: YamlStep | undefined,
  context: Record<string, unknown>,
  workerId: string
): { eventType: string; payload: Record<string, unknown> } | undefined => {
  const parsed = parseRendered(step, context);
  if (!parsed.success) {
    return undefined;
  }
  const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
  registerAlertZeroTelemetryEvents(analytics);
  const reportEvent = jest.spyOn(analytics, 'reportEvent');
  const envelope: AlertZeroEnvelope = {
    ...resolveWorkerCatalogFields(workerId),
    autonomy_level: 'manual',
    autonomy_mode: 'gated',
    execution_id: 'c5d0e2a9-3b7e-4c61-8f2d-6a9b0e4d7f21',
    is_default_space: true,
    run_id: '0b6a1f4e-8c43-4a39-9a4e-1f7f5f3f9c10',
    trigger_type: 'scheduled',
  };
  const reported = reportOutcome({
    envelope,
    input: parsed.data,
    report: createAlertZeroTelemetryReporter({ analytics, logger: loggerMock.create() }),
  });
  const [call] = reportEvent.mock.calls;
  return reported && call
    ? { eventType: call[0], payload: call[1] as Record<string, unknown> }
    : undefined;
};

describe('shipped Attack Discovery Worker YAML and the reportWorkerOutcome schema', () => {
  // A set, because both review close sites report `worker_investigation_closed`.
  it('reports every Attack Discovery event and the two events any Worker shares', () => {
    expect(
      [...new Set([...runnerReports, ...reviewReports].map((step) => step.with?.event))].sort()
    ).toEqual(
      REPORT_WORKER_OUTCOME_EVENTS.filter(
        (event) =>
          EVENT_WORKER_IDS[event] === SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID ||
          event === 'worker_run_completed' ||
          event === 'worker_investigation_closed'
      ).sort()
    );
  });

  it('reports only events the step accepts from the Attack Discovery Worker', () => {
    expect(
      [...runnerReports, ...reviewReports]
        .map((step) => String(step.with?.event))
        .filter(
          (event) =>
            !(REPORT_WORKER_OUTCOME_EVENTS as readonly string[]).includes(event) ||
            !isEventFromItsWorker(
              event as (typeof REPORT_WORKER_OUTCOME_EVENTS)[number],
              SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID
            )
        )
    ).toEqual([]);
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

    it.each([
      ['produced', { batchesFailed: 0, batchesTotal: 3, generated: 5, persisted: 4 }],
      ['empty_nothing_pending', { batchesFailed: 0, batchesTotal: 0, generated: 0, persisted: 0 }],
      ['empty_nothing_found', { batchesFailed: 0, batchesTotal: 2, generated: 3, persisted: 0 }],
      ['degraded_partial', { batchesFailed: 1, batchesTotal: 3, generated: 2, persisted: 2 }],
      ['failed_all_items', { batchesFailed: 3, batchesTotal: 3, generated: 0, persisted: 0 }],
    ] as const)('sends a valid %s worker_run_completed', (runOutcome, scenario) => {
      const degraded = scenario.batchesFailed > 0;

      expect(
        parseRendered(
          reportNamed(runnerReports, 'report_worker_run_completed'),
          runnerContext(scenario)
        )
      ).toEqual({
        data: {
          candidates_found: scenario.batchesTotal * 100,
          degraded,
          degraded_reason: degraded ? 'dependency_unavailable' : 'none',
          event: 'worker_run_completed',
          items_dispatched: scenario.batchesTotal,
          items_failed: scenario.batchesFailed,
          items_in_flight: scenario.persisted,
          lookup_failed: false,
          run_outcome: runOutcome,
          source_read_failed: false,
        },
        success: true,
      });
    });

    it('reports a worker_run_completed payload the registered schema accepts', () => {
      expect(
        reportOnDevModeClient(
          reportNamed(runnerReports, 'report_worker_run_completed'),
          runnerContext({ batchesFailed: 1, batchesTotal: 3, generated: 2, persisted: 2 }),
          SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID
        )
      ).toEqual({
        eventType: 'alertzero_worker_run_completed',
        payload: {
          autonomy_level: 'manual',
          autonomy_mode: 'gated',
          execution_id: 'c5d0e2a9-3b7e-4c61-8f2d-6a9b0e4d7f21',
          is_default_space: true,
          run_id: '0b6a1f4e-8c43-4a39-9a4e-1f7f5f3f9c10',
          trigger_type: 'scheduled',
          watch_tag: 'watch-floor',
          worker_id: 'system-security-floor-attack-discovery',
          candidates_found: 300,
          degraded: true,
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 3,
          items_failed: 1,
          items_in_flight: 2,
          lookup_failed: false,
          run_outcome: 'degraded_partial',
          source_read_failed: false,
        },
      });
    });

    it('sends a valid worker_run_completed when the generation output is empty', () => {
      expect(
        parseRendered(reportNamed(runnerReports, 'report_worker_run_completed'), {
          steps: { resolve_fanout: { output: {} }, run_generation: { output: {} } },
        }).success
      ).toBe(true);
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
          event: 'worker_investigation_closed',
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
