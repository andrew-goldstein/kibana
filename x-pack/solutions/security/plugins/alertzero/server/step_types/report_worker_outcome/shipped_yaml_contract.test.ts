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
  ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID,
  ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID,
  ALERTZERO_FLOOR_ALERT_TRIAGE_REVIEW_WORKFLOW_ID,
  ALERTZERO_FORENSICS_RUN_ENDPOINT_ANALYSIS_WORKFLOW_ID,
  ALERTZERO_HUNT_PACKAGE_REPORT_WORKFLOW_ID,
  ALERTZERO_HUNT_PROPOSAL_GATE_WORKFLOW_ID,
  ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID,
  ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID,
  ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID,
  ALERTZERO_WORKER_FORENSICS_ENDPOINT_ANALYSIS_WORKFLOW_ID,
  ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID,
  ALERTZERO_WORKER_DETECTION_RULE_COVERAGE_WORKFLOW_ID,
  ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID,
  ALERTZERO_WORKER_FLOOR_ATTACK_DISCOVERY_WORKFLOW_ID,
  getManagedWorkflowDefinition,
  getManagedWorkflowDefinitions,
} from '@kbn/workflows/managed';
import type { ManagedWorkflowTemplateValuesById } from '@kbn/workflows/managed';
import {
  SYSTEM_SECURITY_WORKER_DETECTION_RULE_COVERAGE_ID,
  SYSTEM_SECURITY_WORKER_DETECTION_RULE_TUNING_ID,
  SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID,
  SYSTEM_SECURITY_WORKER_FLOOR_ATTACK_DISCOVERY_ID,
  SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID,
  SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID,
} from '@kbn/alertzero-common';
import { ALERTZERO_MANAGED_WORKFLOW_OWNER_ID } from '../../../common/constants';
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
 * The contract between the shipped Worker YAML and the report step's input schema.
 * `@kbn/workflows` cannot import this plugin, so this is where each shipped `with` block is
 * rendered the way the engine renders it and validated against the real schema.
 */

interface YamlStep {
  name: string;
  type: string;
  if?: string;
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

/** Representative values for the Worker definitions rendered from a YAML template. */
const TEMPLATE_VALUES: Partial<ManagedWorkflowTemplateValuesById> = {
  [ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    extras: { autoCloseConfidenceScoreMinThreshold: 0.85 },
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID]: {
    autonomyLevel: 'assisted',
    scheduleInterval: '4h',
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_FORENSICS_ENDPOINT_ANALYSIS_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_FLOOR_ATTACK_DISCOVERY_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    scheduleInterval: '24h',
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    extras: { analysisWindowDays: 7, fpCountThreshold: 10, fpRateThresholdPct: 50 },
    scheduleInterval: '2h',
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_DETECTION_RULE_COVERAGE_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    extras: { lookbackDays: 14, maxGapsPerRun: 5 },
    scheduleInterval: '1h',
    settingsVersion: 1,
  },
};

const getManagedYaml = (workflowId: string): string => {
  const definition = getManagedWorkflowDefinition(workflowId);
  if (definition && 'yaml' in definition && definition.yaml) {
    return definition.yaml;
  }
  const values = (TEMPLATE_VALUES as Record<string, unknown>)[workflowId];
  if (!definition || !definition.yamlTemplate || !values) {
    throw new Error(`Managed workflow "${workflowId}" has no YAML to render`);
  }
  return definition.yamlTemplate(values as never);
};

const reportStepsOf = (workflowId: string): YamlStep[] =>
  flatten((parse(getManagedYaml(workflowId)) as { steps: YamlStep[] }).steps).filter(
    ({ type }) => type === ReportWorkerOutcomeStepId
  );

const runnerReports = reportStepsOf(ALERTZERO_ATTACK_DISCOVERY_WORKER_WORKFLOW_ID);

/** Every AlertZero managed workflow whose YAML has a report step, at any depth. */
const WORKFLOWS_WITH_REPORT_STEPS = getManagedWorkflowDefinitions()
  .filter(({ pluginId }) => pluginId === ALERTZERO_MANAGED_WORKFLOW_OWNER_ID)
  .map(({ id }) => id)
  .filter((workflowId) => reportStepsOf(workflowId).length > 0);
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

describe('shipped Worker reports and the reportWorkerOutcome schema', () => {
  // Runs where every report step's guard passes, the way the engine would have them.
  const changedStatus = { changed_fields: ['status'], metadata: { close_reason: 'resolved' } };
  const investigation = { output: { conversation_id: INVESTIGATION_ID } };

  /** For each Worker workflow: the Worker that owns it, and runs that exercise its reports. */
  const WORKER_WORKFLOWS: Array<{
    contexts: Array<Record<string, unknown>>;
    workerId: string;
    workflowId: string;
  }> = [
    {
      contexts: [
        {
          consts: { no_rows: [] },
          steps: {
            collect_active_rules: { output: { expected: 1 } },
            collect_candidates: { output: { count: 3 } },
            harvest_fp_alerts_by_rule: { output: { values: [] } },
            list_active_reviews: { output: { results: [] } },
            resolve_fanout_rows: { output: { rows: [['rule-1'], ['rule-2']] } },
          },
        },
        {
          consts: { no_rows: [] },
          steps: {
            harvest_fp_alerts_by_rule: { error: { message: 'search failed' } },
            list_active_reviews: { error: { message: 'HTTP 500' } },
          },
        },
      ],
      workerId: SYSTEM_SECURITY_WORKER_DETECTION_RULE_TUNING_ID,
      workflowId: ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          steps: {
            close_investigation_declined: { output: changedStatus },
            create_investigation: investigation,
          },
        },
        {
          steps: {
            close_investigation_applied: { output: changedStatus },
            create_investigation: investigation,
            diagnose_rule: {
              output: { structured_output: { change_type: 'query', confidence: 'low' } },
            },
            fetch_rule: { output: { enabled: true } },
            propose_query: { output: { decision: 'approved', status: 'succeeded' } },
            record_preview_outcome: {
              output: {
                current_alert_count: 4,
                current_succeeded: true,
                proposed_alert_count: 1,
                proposed_succeeded: true,
              },
            },
            record_proposal_action_decision: {
              output: { applied: true, approved: true, dismissed: false },
            },
          },
        },
        {
          steps: {
            close_investigation_dismissed: { output: changedStatus },
            create_investigation: investigation,
            diagnose_rule: { output: { structured_output: { change_type: 'other' } } },
            fetch_rule: { output: { enabled: true } },
            propose_manual: { output: { decision: 'dismissed', status: 'no_action' } },
            record_proposal_action_decision: {
              output: { applied: false, approved: false, dismissed: true },
            },
          },
        },
        { steps: { fetch_rule: { error: { message: 'HTTP 404: not found' } } } },
      ],
      workerId: SYSTEM_SECURITY_WORKER_DETECTION_RULE_TUNING_ID,
      workflowId: ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          consts: { no_rows: [] },
          steps: {
            collect_active_indicators: { output: { count: 2 } },
            list_active_reviews: { output: { results: [] } },
            resolve_dispatch_batch: { output: { indicators: [{ _id: 'ki-1' }] } },
            search_pending_indicators: { output: { hits: { total: { value: 6 } } } },
          },
        },
        {
          consts: { no_rows: [] },
          steps: {
            collect_active_indicators: { output: { count: 100 } },
            resolve_dispatch_batch: { output: { indicators: [] } },
            search_pending_indicators: { output: { hits: { total: { value: 6 } } } },
          },
        },
        {
          consts: { no_rows: [] },
          steps: { search_pending_indicators: { error: { message: 'search failed' } } },
        },
      ],
      workerId: SYSTEM_SECURITY_WORKER_DETECTION_RULE_COVERAGE_ID,
      workflowId: ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          steps: {
            close_investigation_resolved: { output: changedStatus },
            coverage_check: { output: { structured_output: { verdict: 'covered_disabled' } } },
            create_investigation: investigation,
            mark_processed: { output: { result: 'updated' } },
            propose_enable: { output: { decision: 'approved', status: 'succeeded' } },
            record_decision: { output: { applied: true, approved: true, dismissed: false } },
            refetch_rule: { output: { enabled: true } },
            resolve_outcome: {
              output: { enable_approved_not_applied: false, install_approved_not_applied: false },
            },
          },
        },
        {
          steps: {
            close_investigation_dismissed: { output: changedStatus },
            coverage_check: { output: { structured_output: { verdict: 'no_coverage' } } },
            create_investigation: investigation,
            record_decision: { output: { applied: false, approved: false, dismissed: true } },
            run_rule_creation: {
              output: { created: false, decision: 'dismissed', skip_reason: '' },
            },
          },
        },
        { steps: { read_ki: { output: { hits: { total: { value: 0 } } } } } },
        {
          steps: {
            close_investigation_declined: { output: changedStatus },
            create_investigation: investigation,
            propose_entry: { output: { decision: 'dismissed', status: 'no_action' } },
          },
        },
      ],
      workerId: SYSTEM_SECURITY_WORKER_DETECTION_RULE_COVERAGE_ID,
      workflowId: ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          steps: {
            classify_alerts: {
              output: { false_positive_count: 3, inconclusive_count: 1, true_positive_count: 2 },
            },
            close_investigation_review_limit: { output: changedStatus },
            create_investigation: investigation,
          },
          variables: {
            alert_count: 6,
            fp_candidate_count: 3,
            review_dispatch: 'limit',
            verdict_count: 6,
          },
        },
        {
          steps: {
            classify_alerts: {
              output: { false_positive_count: 0, inconclusive_count: 0, true_positive_count: 4 },
            },
            close_no_fp: { output: changedStatus },
            create_investigation: investigation,
          },
          variables: { alert_count: 5, fp_candidate_count: 0, verdict_count: 4 },
        },
        {
          steps: { create_investigation: investigation },
          variables: { alert_count: 3, fp_candidate_count: 0, verdict_count: 0 },
        },
      ],
      workerId: SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID,
      workflowId: ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID,
    },
    {
      contexts: ['approved', 'dismissed', 'expired', 'unknown'].map((outcome) => ({
        inputs: { autonomy: 'supervised', conversation_id: INVESTIGATION_ID },
        steps: {
          close_investigation_after_approval: { output: changedStatus },
          close_investigation_after_dismissal: { output: changedStatus },
          close_investigation_after_expiry: { output: changedStatus },
          get_proposal: { output: {} },
        },
        variables: { failed_retag_count: 1, fp_candidate_count: 9, proposal_outcome: outcome },
      })),
      workerId: SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID,
      workflowId: ALERTZERO_FLOOR_ALERT_TRIAGE_REVIEW_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          steps: {
            check_index_scope: { output: { status: 'ok' } },
            report_fan_out: {
              output: {
                failed: 1,
                results: [
                  { output: { outcome: 'completed' }, status: 'completed' },
                  { output: { outcome: 'partial' }, status: 'completed' },
                  { status: 'failed' },
                ],
              },
            },
            resolve_index_scope_gate: { output: { index_scope_blocked: false } },
            select_candidate_reports: { output: { ids: ['r-1', 'r-2', 'r-3'] } },
          },
        },
        {
          steps: {
            check_index_scope: { output: { status: 'blocked' } },
            resolve_index_scope_gate: { output: { index_scope_blocked: true } },
          },
        },
      ],
      workerId: SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID,
      workflowId: ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          inputs: {
            hasConfirmedHit: false,
            huntStatus: 'success',
            investigationConversationId: INVESTIGATION_ID,
            tier2Invoked: true,
          },
          steps: {
            decide_and_package: {
              output: {
                coverage: { skipped: [], written: [{ kiId: 'ki-1' }] },
                dismiss: true,
                mintSuppression: 'none',
                proposals: [],
                status: 'packaged',
              },
            },
            dismiss_investigation_if_clean: { output: changedStatus },
          },
          variables: {
            dismiss_close_failed: false,
            dispatch_failed_count: 0,
            package_status: 'success',
          },
        },
        {
          inputs: {
            hasConfirmedHit: true,
            huntStatus: 'partial',
            investigationConversationId: INVESTIGATION_ID,
          },
          steps: {},
          variables: {
            dismiss_close_failed: false,
            dispatch_failed_count: 0,
            package_status: 'run_incomplete',
          },
        },
      ],
      workerId: SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID,
      workflowId: ALERTZERO_HUNT_PACKAGE_REPORT_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          inputs: { investigationConversationId: INVESTIGATION_ID },
          steps: { close_if_settled: { output: changedStatus } },
        },
      ],
      workerId: SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID,
      workflowId: ALERTZERO_HUNT_PROPOSAL_GATE_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          steps: {
            search_pending_indicators: { output: { hits: { total: { value: 2 } } } },
            start_runs: { output: { failed: 1, succeeded: 1 } },
          },
        },
        { steps: { search_pending_indicators: { error: { message: 'search failed' } } } },
      ],
      workerId: SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID,
      workflowId: ALERTZERO_WORKER_FORENSICS_ENDPOINT_ANALYSIS_WORKFLOW_ID,
    },
    {
      contexts: [
        {
          steps: {
            forensic_analysis: {
              output: { structured_output: { propose: true, recommendedActions: [{}, {}] } },
            },
            propose_actions: { output: { failed: 0, succeeded: 2 } },
            read_ki: { output: { hits: { hits: [{ _id: 'ki-1' }] } } },
            resolve_autonomy: { output: { level: 'supervised' } },
            resolve_finding_presence: { output: { iocs: true, timeline: true } },
            resolve_host: { output: { host_name: 'host-1' } },
            resolve_prior_assessment: { output: { count: 0 } },
            resolve_proposal_dispatch: { output: { failed: 0 } },
            resolve_proposals: { output: { proposals_lost: false } },
            resolve_request: { output: { has_request: true } },
            resolve_run_outcome: { output: { attached: true, settled: true } },
            verify_investigation: { output: { metadata: {} } },
          },
        },
        { steps: { read_ki: { output: { hits: { hits: [] } } } } },
      ],
      workerId: SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID,
      workflowId: ALERTZERO_FORENSICS_RUN_ENDPOINT_ANALYSIS_WORKFLOW_ID,
    },
  ];

  // Every Worker but Attack Discovery (covered above) now reports through the step, and every
  // report step in the AlertZero managed workflows is covered by this contract.
  it('covers every AlertZero workflow with a report step', () => {
    expect(
      [
        ALERTZERO_ATTACK_DISCOVERY_REVIEW_WORKFLOW_ID,
        ALERTZERO_ATTACK_DISCOVERY_WORKER_WORKFLOW_ID,
        ...WORKER_WORKFLOWS.map(({ workflowId }) => workflowId),
      ].sort()
    ).toEqual(WORKFLOWS_WITH_REPORT_STEPS.sort());
  });

  const guardPasses = (step: YamlStep, context: Record<string, unknown>): boolean =>
    !step.if || liquid.evalValueSync(step.if.trim().slice(3, -2).trim(), context) === true;

  describe.each(WORKER_WORKFLOWS)('$workflowId', ({ contexts, workerId, workflowId }) => {
    const reports = reportStepsOf(workflowId);

    it('has report steps', () => {
      expect(reports.length).toBeGreaterThan(0);
    });

    it.each(reports.map((step) => [step.name, step] as const))(
      '%s reports an event its own Worker may send',
      (_name, step) => {
        expect(
          isEventFromItsWorker(
            step.with?.event as (typeof REPORT_WORKER_OUTCOME_EVENTS)[number],
            workerId
          )
        ).toBe(true);
      }
    );

    it.each(reports.map((step) => [step.name, step] as const))(
      '%s renders a valid input in every run where it reports, and reports in at least one',
      (_name, step) => {
        const results = contexts
          .filter((context) => guardPasses(step, context))
          .map((context) => {
            const result = parseRendered(step, context);
            return result.success ? result.data.event : result.error.issues;
          });

        expect({ events: results, reported: results.length > 0 }).toEqual({
          events: results.map(() => step.with?.event),
          reported: true,
        });
      }
    );

    it.each(reports.map((step) => [step.name, step] as const))(
      '%s reports a payload the registered schema accepts in every run where it reports',
      (_name, step) => {
        const reported = contexts
          .filter((context) => guardPasses(step, context))
          .map((context) => reportOnDevModeClient(step, context, workerId)?.eventType);

        expect(reported).toEqual(reported.map(() => `alertzero_${step.with?.event}`));
      }
    );
  });
});

describe('shipped Worker reports as the debug log prints them', () => {
  const ENVELOPE_FIELDS = {
    autonomy_level: 'manual',
    autonomy_mode: 'gated',
    execution_id: 'c5d0e2a9-3b7e-4c61-8f2d-6a9b0e4d7f21',
    is_default_space: true,
    run_id: '0b6a1f4e-8c43-4a39-9a4e-1f7f5f3f9c10',
    trigger_type: 'scheduled',
  };

  it('reports a Rule Coverage sweep that started reviews', () => {
    expect(
      reportOnDevModeClient(
        reportNamed(
          reportStepsOf(ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID),
          'report_worker_run_completed'
        ),
        {
          consts: { no_rows: [] },
          steps: {
            collect_active_indicators: { output: { count: 2 } },
            list_active_reviews: { output: { results: [] } },
            resolve_dispatch_batch: { output: { indicators: [{ _id: 'ki-1' }, { _id: 'ki-2' }] } },
            search_pending_indicators: { output: { hits: { total: { value: 6 } } } },
          },
        },
        SYSTEM_SECURITY_WORKER_DETECTION_RULE_COVERAGE_ID
      )
    ).toEqual({
      eventType: 'alertzero_worker_run_completed',
      payload: {
        ...ENVELOPE_FIELDS,
        watch_tag: 'watch-detection',
        worker_id: 'system-security-detection-rule-coverage',
        candidates_found: 6,
        degraded: false,
        degraded_reason: 'none',
        items_dispatched: 2,
        items_failed: 0,
        items_in_flight: 4,
        lookup_failed: false,
        run_outcome: 'produced',
        source_read_failed: false,
      },
    });
  });

  it('reports a Rule Tuning review whose approved query change was applied', () => {
    expect(
      reportOnDevModeClient(
        reportNamed(
          reportStepsOf(ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID),
          'report_review_completed'
        ),
        {
          steps: {
            create_investigation: { output: { conversation_id: INVESTIGATION_ID } },
            diagnose_rule: {
              output: { structured_output: { change_type: 'query', confidence: 'high' } },
            },
            fetch_rule: { output: { enabled: true } },
            propose_query: { output: { decision: 'approved', status: 'succeeded' } },
            record_preview_outcome: {
              output: {
                current_alert_count: 12,
                current_succeeded: true,
                proposed_alert_count: 3,
                proposed_succeeded: true,
              },
            },
            record_proposal_action_decision: {
              output: { applied: true, approved: true, dismissed: false },
            },
          },
        },
        SYSTEM_SECURITY_WORKER_DETECTION_RULE_TUNING_ID
      )
    ).toEqual({
      eventType: 'alertzero_rule_tuning_review_completed',
      payload: {
        ...ENVELOPE_FIELDS,
        watch_tag: 'watch-detection',
        worker_id: 'system-security-detection-rule-tuning',
        applied: true,
        backtest_ran: true,
        backtest_reduced_alerts: true,
        change_type: 'query',
        confidence: 'high',
        decision: 'approved',
        entry_gate: 'skipped',
        investigation_id: INVESTIGATION_ID,
        rule_unavailable: false,
      },
    });
  });

  it('reports an Alert Triage batch with false-positive candidates', () => {
    expect(
      reportOnDevModeClient(
        reportNamed(
          reportStepsOf(ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID),
          'report_batch_classified'
        ),
        {
          steps: {
            classify_alerts: {
              output: { false_positive_count: 23, inconclusive_count: 5, true_positive_count: 10 },
            },
            create_investigation: { output: { conversation_id: INVESTIGATION_ID } },
          },
          variables: { alert_count: 40, fp_candidate_count: 20, verdict_count: 38 },
        },
        SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID
      )
    ).toEqual({
      eventType: 'alertzero_alert_triage_batch_classified',
      payload: {
        ...ENVELOPE_FIELDS,
        watch_tag: 'watch-floor',
        worker_id: 'system-security-floor-alert-triage',
        alerts_total: 40,
        alerts_without_verdict: 2,
        fp_below_floor: 3,
        fp_candidates: 20,
        investigation_id: INVESTIGATION_ID,
        verdicts_false_positive: 23,
        verdicts_inconclusive: 5,
        verdicts_true_positive: 10,
      },
    });
  });

  it('reports an Alert Triage run that handed its candidates to the closure review', () => {
    expect(
      reportOnDevModeClient(
        reportNamed(
          reportStepsOf(ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID),
          'report_worker_run_completed'
        ),
        {
          variables: {
            alert_count: 40,
            fp_candidate_count: 20,
            review_dispatch: 'started',
            verdict_count: 38,
          },
        },
        SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID
      )
    ).toEqual({
      eventType: 'alertzero_worker_run_completed',
      payload: {
        ...ENVELOPE_FIELDS,
        watch_tag: 'watch-floor',
        worker_id: 'system-security-floor-alert-triage',
        candidates_found: 40,
        degraded: true,
        degraded_reason: 'missing_data',
        items_dispatched: 38,
        items_failed: 2,
        items_in_flight: 20,
        lookup_failed: false,
        run_outcome: 'degraded_partial',
        source_read_failed: false,
      },
    });
  });

  it('reports a Hunt report that packaging closed as benign after a Tier 2 run', () => {
    expect(
      reportOnDevModeClient(
        reportNamed(
          reportStepsOf(ALERTZERO_HUNT_PACKAGE_REPORT_WORKFLOW_ID),
          'report_report_completed'
        ),
        {
          inputs: {
            hasConfirmedHit: false,
            huntStatus: 'success',
            investigationConversationId: '3f1c2b4a-5d6e-5f70-8a9b-0c1d2e3f4a5b',
            tier2Invoked: true,
          },
          steps: {
            decide_and_package: {
              output: {
                coverage: { skipped: [], written: [{ kiId: 'ki-1' }, { kiId: 'ki-2' }] },
                dismiss: true,
                mintSuppression: 'none',
                proposals: [],
                status: 'packaged',
              },
            },
          },
          variables: {
            dismiss_close_failed: false,
            dispatch_failed_count: 0,
            package_status: 'success',
          },
        },
        SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID
      )
    ).toEqual({
      eventType: 'alertzero_hunt_report_completed',
      payload: {
        ...ENVELOPE_FIELDS,
        watch_tag: 'watch-hunt',
        worker_id: 'system-security-hunt-continuous-threat-hunt',
        closed_clean: true,
        coverage_kis_skipped: 0,
        coverage_kis_written: 2,
        has_confirmed_hit: false,
        hunt_status: 'success',
        investigation_id: '3f1c2b4a-5d6e-5f70-8a9b-0c1d2e3f4a5b',
        mint_suppression: 'none',
        package_status: 'success',
        proposals_dispatch_failed: 0,
        proposals_prepared: 0,
        tier2_invoked: true,
      },
    });
  });

  it('reports a Hunt sweep with one partial and one failed report', () => {
    expect(
      reportOnDevModeClient(
        reportNamed(
          reportStepsOf(ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID),
          'report_worker_run_completed'
        ),
        {
          steps: {
            check_index_scope: { output: { status: 'ok' } },
            report_fan_out: {
              output: {
                failed: 0,
                results: [
                  { output: { outcome: 'completed' }, status: 'completed' },
                  { output: { outcome: 'partial' }, status: 'completed' },
                  { output: { outcome: 'failed' }, status: 'completed' },
                ],
              },
            },
            resolve_index_scope_gate: { output: { index_scope_blocked: false } },
            select_candidate_reports: { output: { ids: ['r-1', 'r-2', 'r-3'] } },
          },
        },
        SYSTEM_SECURITY_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_ID
      )
    ).toEqual({
      eventType: 'alertzero_worker_run_completed',
      payload: {
        ...ENVELOPE_FIELDS,
        watch_tag: 'watch-hunt',
        worker_id: 'system-security-hunt-continuous-threat-hunt',
        candidates_found: 3,
        degraded: true,
        degraded_reason: 'dependency_unavailable',
        items_dispatched: 3,
        items_failed: 1,
        items_in_flight: 0,
        lookup_failed: false,
        run_outcome: 'degraded_partial',
        source_read_failed: false,
      },
    });
  });

  it('reports an Endpoint Analysis run that attached findings and proposed containment', () => {
    expect(
      reportOnDevModeClient(
        reportNamed(
          reportStepsOf(ALERTZERO_FORENSICS_RUN_ENDPOINT_ANALYSIS_WORKFLOW_ID),
          'report_analysis_completed'
        ),
        {
          steps: {
            forensic_analysis: {
              output: { structured_output: { propose: true, recommendedActions: [{}, {}] } },
            },
            propose_actions: { output: { failed: 0, succeeded: 2 } },
            read_ki: { output: { hits: { hits: [{ _id: 'ki-1' }] } } },
            resolve_autonomy: { output: { level: 'manual' } },
            resolve_finding_presence: { output: { iocs: true, timeline: true } },
            resolve_host: { output: { host_name: 'host-1' } },
            resolve_prior_assessment: { output: { count: 0 } },
            resolve_proposal_dispatch: { output: { failed: 0 } },
            resolve_proposals: { output: { proposals_lost: false } },
            resolve_request: { output: { has_request: true } },
            resolve_run_outcome: { output: { attached: true, settled: true } },
            verify_investigation: { output: { metadata: {} } },
          },
        },
        SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID
      )
    ).toEqual({
      eventType: 'alertzero_endpoint_analysis_completed',
      payload: {
        ...ENVELOPE_FIELDS,
        watch_tag: 'watch-forensics',
        worker_id: 'system-security-forensics-endpoint-analysis',
        actions_recommended: 2,
        agent_failed: false,
        analysis_outcome: 'processed',
        auto_approve_requested: false,
        findings_attached: true,
        host_resolved: true,
        iocs_found: true,
        proposals_dispatch_failed: 0,
        proposals_dispatched: 2,
        reused_prior_assessment: false,
        timeline_found: true,
      },
    });
  });

  it('reports an Endpoint Analysis poll that started an analysis', () => {
    expect(
      reportOnDevModeClient(
        reportNamed(
          reportStepsOf(ALERTZERO_WORKER_FORENSICS_ENDPOINT_ANALYSIS_WORKFLOW_ID),
          'report_worker_run_completed'
        ),
        {
          steps: {
            search_pending_indicators: { output: { hits: { total: { value: 3 } } } },
            start_runs: { output: { failed: 0, succeeded: 2 } },
          },
        },
        SYSTEM_SECURITY_WORKER_FORENSICS_ENDPOINT_ANALYSIS_ID
      )
    ).toEqual({
      eventType: 'alertzero_worker_run_completed',
      payload: {
        ...ENVELOPE_FIELDS,
        watch_tag: 'watch-forensics',
        worker_id: 'system-security-forensics-endpoint-analysis',
        candidates_found: 3,
        degraded: false,
        degraded_reason: 'none',
        items_dispatched: 2,
        items_failed: 0,
        items_in_flight: 2,
        lookup_failed: false,
        run_outcome: 'produced',
        source_read_failed: false,
      },
    });
  });
});
