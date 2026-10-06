/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import {
  ALERTZERO_COVERAGE_REVIEW_WORKFLOW,
  ALERTZERO_COVERAGE_WORKER_WORKFLOW,
  ALERTZERO_FLOOR_ALERT_TRIAGE_REVIEW_WORKFLOW,
  ALERTZERO_HUNT_PACKAGE_REPORT_WORKFLOW,
  ALERTZERO_HUNT_WORKFLOW,
  ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW,
  ALERTZERO_RULE_TUNING_WORKER_WORKFLOW,
  ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW,
  ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW,
} from '.';
import { createWorkflowLiquidEngine } from '../../../common/utils';

/**
 * The Workers' run and item outcome reports (`alertzero.reportWorkerOutcome` with
 * `worker_run_completed` or a Worker's own item event), rendered the way the engine renders
 * them. This package cannot import the AlertZero plugin, so the plugin's
 * `shipped_yaml_contract.test.ts` validates the same `with` blocks against the step's real input
 * schema; these tests pin the values each scenario renders.
 */

interface YamlStep {
  name: string;
  type?: string;
  if?: string;
  timeout?: string;
  with?: Record<string, unknown>;
  steps?: YamlStep[];
  else?: YamlStep[];
  cases?: Array<{ match?: string; steps: YamlStep[] }>;
  default?: YamlStep[];
  'on-failure'?: { continue?: boolean; fallback?: YamlStep[] };
}

const REPORT_STEP_TYPE = 'alertzero.reportWorkerOutcome';

const INVESTIGATION_ID = '50e2f8ae-f562-46bd-853f-8e0e1f72b9dd';

/** Configured like the engine's templating engine: a missing value renders as `''`. */
const liquid = createWorkflowLiquidEngine({ strictFilters: true, strictVariables: false });

/** A whole-value `${{ }}` keeps its type; anything else renders as a string template. */
const renderValue = (value: unknown, context: Record<string, unknown>): unknown => {
  if (typeof value === 'string' && value.startsWith('${{') && value.endsWith('}}')) {
    return liquid.evalValueSync(value.slice(3, -2).trim(), context);
  }
  return typeof value === 'string' ? liquid.parseAndRenderSync(value, context) : value;
};

const topLevelSteps = (yaml: string): YamlStep[] => (parse(yaml) as { steps: YamlStep[] }).steps;

const stepNamed = (steps: YamlStep[], name: string): YamlStep => {
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) {
    throw new Error(`No step named ${name}`);
  }
  return step;
};

/** The `with` block of a report step, rendered against a run's context, without the event. */
const renderReport = (step: YamlStep, context: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(step.with ?? {})
      .filter(([key]) => key !== 'event')
      .map(([key, value]) => [key, renderValue(value, context)])
  );

const evalGuard = (step: YamlStep, context: Record<string, unknown>): unknown =>
  step.if ? liquid.evalValueSync(step.if.trim().slice(3, -2).trim(), context) : true;

/** Asserts a report step is telemetry only: top level, bounded, and never fails the run. */
const describeReportStep = (steps: YamlStep[], name: string, event: string, before: string) => {
  const names = steps.map((step) => step.name);

  it(`${name} reports ${event}`, () => {
    expect([stepNamed(steps, name).type, stepNamed(steps, name).with?.event]).toEqual([
      REPORT_STEP_TYPE,
      event,
    ]);
  });

  it(`${name} continues on failure within a 30s timeout`, () => {
    const step = stepNamed(steps, name);

    expect({ continue: step['on-failure']?.continue, timeout: step.timeout }).toEqual({
      continue: true,
      timeout: '30s',
    });
  });

  it(`${name} runs right before ${before}`, () => {
    expect(names.indexOf(before) - names.indexOf(name)).toBe(1);
  });
};

describe('Rule Tuning outcome reports', () => {
  describe('the sweep (rule_tuning_worker.yaml)', () => {
    const steps = topLevelSteps(ALERTZERO_RULE_TUNING_WORKER_WORKFLOW.yaml);
    const report = stepNamed(steps, 'report_worker_run_completed');

    describeReportStep(steps, 'report_worker_run_completed', 'worker_run_completed', 'emit_result');

    const sweepContext = ({
      activeReviews = 0,
      candidates = 0,
      harvestFailed = false,
      lookupFailed = false,
      requested = 0,
    }: {
      activeReviews?: number;
      candidates?: number;
      harvestFailed?: boolean;
      lookupFailed?: boolean;
      requested?: number;
    }): Record<string, unknown> => ({
      consts: { no_rows: [] },
      steps: {
        collect_active_rules: { output: { expected: activeReviews } },
        collect_candidates: { output: { count: candidates } },
        harvest_fp_alerts_by_rule: harvestFailed
          ? { error: { message: 'search_phase_execution_exception' } }
          : { output: { values: [] } },
        list_active_reviews: lookupFailed
          ? { error: { message: 'HTTP 500' } }
          : { output: { results: [] } },
        resolve_fanout_rows: {
          output: { rows: Array.from({ length: requested }, (_, index) => [`rule-${index}`]) },
        },
      },
    });

    it.each([
      [
        'reviews requested for noisy rules',
        { activeReviews: 1, candidates: 3, requested: 2 },
        {
          candidates_found: 3,
          degraded: false,
          degraded_reason: 'none',
          items_dispatched: 2,
          items_in_flight: 1,
          lookup_failed: false,
          run_outcome: 'produced',
          source_read_failed: false,
        },
      ],
      [
        'no noisy rule',
        {},
        {
          candidates_found: 0,
          degraded: false,
          degraded_reason: 'none',
          items_dispatched: 0,
          items_in_flight: 0,
          lookup_failed: false,
          run_outcome: 'empty_nothing_found',
          source_read_failed: false,
        },
      ],
      [
        'a failed harvest',
        { harvestFailed: true },
        {
          candidates_found: 0,
          degraded: true,
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 0,
          items_in_flight: 0,
          lookup_failed: false,
          run_outcome: 'failed_source_unavailable',
          source_read_failed: true,
        },
      ],
      [
        'a failed in-flight lookup the sweep carried on without',
        { candidates: 2, lookupFailed: true, requested: 2 },
        {
          candidates_found: 2,
          degraded: true,
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 2,
          items_in_flight: 0,
          lookup_failed: true,
          run_outcome: 'produced',
          source_read_failed: false,
        },
      ],
    ])('renders %s', (_scenario, scenario, expected) => {
      expect(renderReport(report, sweepContext(scenario))).toEqual(expected);
    });

    // An open change replaces the sweep's join with fire-and-forget starts and drops the
    // decision totals, so the report reads none of them.
    it('reads no review decision total', () => {
      expect(JSON.stringify(report.with)).not.toMatch(
        /reviews_approved|reviews_failed|rules_applied|run_reviews/
      );
    });
  });

  describe('the review (rule_tuning_review.yaml)', () => {
    const steps = topLevelSteps(ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW.yaml);
    // The manual entry gate ends the run in its `dismissed` and `expired` arms, so each arm
    // reports the review itself, right before the step that stops the run.
    const entryArm = (match: string): YamlStep[] =>
      stepNamed(stepNamed(steps, 'entry_gate').steps ?? [], 'entry_decision').cases?.find(
        (entryCase) => entryCase.match === match
      )?.steps ?? [];
    const declinedArm = entryArm('dismissed');
    const undecidedArm = entryArm('expired');
    const declinedReport = stepNamed(declinedArm, 'report_review_completed_declined');
    const undecidedReport = stepNamed(undecidedArm, 'report_review_completed_undecided');
    const report = stepNamed(steps, 'report_review_completed');

    describeReportStep(
      declinedArm,
      'report_review_completed_declined',
      'rule_tuning_review_completed',
      'stop_declined'
    );
    describeReportStep(
      undecidedArm,
      'report_review_completed_undecided',
      'rule_tuning_review_completed',
      'stop_expired'
    );
    describeReportStep(
      steps,
      'report_review_completed',
      'rule_tuning_review_completed',
      'emit_result'
    );

    it('reports a declined or unanswered entry gate unconditionally inside its own arm', () => {
      expect([evalGuard(declinedReport, {}), evalGuard(undecidedReport, {})]).toEqual([true, true]);
    });

    it.each([
      ['a declined review', () => declinedReport, 'declined'],
      ['an unanswered entry gate', () => undecidedReport, 'undecided'],
    ])('renders %s', (_label, getReport, entryGate) => {
      expect(
        renderReport(getReport(), {
          steps: { create_investigation: { output: { conversation_id: INVESTIGATION_ID } } },
        })
      ).toEqual({
        applied: false,
        backtest_ran: false,
        backtest_reduced_alerts: false,
        change_type: 'none',
        confidence: 'none',
        decision: 'none',
        entry_gate: entryGate,
        investigation_id: INVESTIGATION_ID,
        rule_unavailable: false,
      });
    });

    const reviewContext = ({
      changeType = 'query',
      confidence = 'high',
      decision,
      entryDecision,
      entryStatus,
      previews = { current: 12, proposed: 3 },
      proposalStatus = 'succeeded',
      ruleAvailable = true,
    }: {
      changeType?: string;
      confidence?: string;
      decision?: 'approved' | 'dismissed';
      entryDecision?: 'approved' | 'dismissed';
      entryStatus?: string;
      previews?: { current: number; proposed: number } | null;
      proposalStatus?: string;
      ruleAvailable?: boolean;
    }): Record<string, unknown> => {
      const knownArm = ['query', 'risk_score', 'exception', 'threshold', 'schedule'].includes(
        changeType
      )
        ? `propose_${changeType}`
        : 'propose_manual';
      return {
        steps: {
          ...(ruleAvailable
            ? {
                create_investigation: { output: { conversation_id: INVESTIGATION_ID } },
                diagnose_rule: {
                  output: { structured_output: { change_type: changeType, confidence } },
                },
                fetch_rule: { output: { enabled: true } },
                [knownArm]: { output: { decision, status: proposalStatus } },
                record_preview_outcome: {
                  output: previews
                    ? {
                        current_alert_count: previews.current,
                        current_succeeded: true,
                        proposed_alert_count: previews.proposed,
                        proposed_succeeded: true,
                      }
                    : {
                        current_alert_count: -1,
                        current_succeeded: false,
                        proposed_alert_count: -1,
                        proposed_succeeded: false,
                      },
                },
                record_proposal_action_decision: {
                  output: {
                    applied: decision === 'approved' && knownArm !== 'propose_manual',
                    approved: decision === 'approved',
                    dismissed: decision === 'dismissed',
                  },
                },
              }
            : { fetch_rule: { error: { message: 'HTTP 404: rule not found' } } }),
          ...(entryStatus
            ? { propose_entry: { output: { decision: entryDecision, status: entryStatus } } }
            : {}),
        },
      };
    };

    it.each([
      [
        'an applied query change at assisted autonomy',
        { decision: 'approved' as const },
        {
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
      ],
      [
        'a dismissed exception after an approved entry gate, with a failed backtest',
        {
          changeType: 'exception',
          confidence: 'medium',
          decision: 'dismissed' as const,
          entryDecision: 'approved' as const,
          entryStatus: 'no_action',
          previews: null,
          proposalStatus: 'no_action',
        },
        {
          applied: false,
          backtest_ran: false,
          backtest_reduced_alerts: false,
          change_type: 'exception',
          confidence: 'medium',
          decision: 'dismissed',
          entry_gate: 'approved',
          investigation_id: INVESTIGATION_ID,
          rule_unavailable: false,
        },
      ],
      [
        'a change type the arms do not name, which the manual arm takes',
        { changeType: 'disable_rule', confidence: 'certain', decision: 'approved' as const },
        {
          applied: false,
          backtest_ran: true,
          backtest_reduced_alerts: true,
          change_type: 'manual',
          confidence: 'none',
          decision: 'approved',
          entry_gate: 'skipped',
          investigation_id: INVESTIGATION_ID,
          rule_unavailable: false,
        },
      ],
      [
        'a proposal nobody decided after an approved entry gate',
        {
          changeType: 'risk_score',
          entryDecision: 'approved' as const,
          entryStatus: 'no_action',
          previews: { current: 3, proposed: 3 },
          proposalStatus: 'expired',
        },
        {
          applied: false,
          backtest_ran: true,
          backtest_reduced_alerts: false,
          change_type: 'risk_score',
          confidence: 'high',
          decision: 'undecided',
          entry_gate: 'approved',
          investigation_id: INVESTIGATION_ID,
          rule_unavailable: false,
        },
      ],
      [
        'a rule that could not be read',
        { ruleAvailable: false },
        {
          applied: false,
          backtest_ran: false,
          backtest_reduced_alerts: false,
          change_type: 'none',
          confidence: 'none',
          decision: 'none',
          entry_gate: 'skipped',
          investigation_id: '',
          rule_unavailable: true,
        },
      ],
    ])('renders %s', (_scenario, scenario, expected) => {
      expect(renderReport(report, reviewContext(scenario))).toEqual(expected);
    });

    it('sends no text the model wrote', () => {
      expect(JSON.stringify(report.with)).not.toMatch(
        /summary|fp_pattern|reasoning|proposed_query|title/
      );
    });
  });
});

describe('Rule Coverage outcome reports', () => {
  describe('the sweep (coverage_worker.yaml)', () => {
    const steps = topLevelSteps(ALERTZERO_COVERAGE_WORKER_WORKFLOW.yaml);
    const report = stepNamed(steps, 'report_worker_run_completed');

    describeReportStep(steps, 'report_worker_run_completed', 'worker_run_completed', 'emit_result');

    const sweepContext = ({
      inFlight = 0,
      lookupFailed = false,
      pending = 0,
      searchFailed = false,
      started = 0,
    }: {
      inFlight?: number;
      lookupFailed?: boolean;
      pending?: number;
      searchFailed?: boolean;
      started?: number;
    }): Record<string, unknown> => ({
      consts: { no_rows: [] },
      steps: {
        collect_active_indicators: { output: { count: inFlight } },
        list_active_reviews: lookupFailed
          ? { error: { message: 'HTTP 500' } }
          : { output: { results: [] } },
        resolve_dispatch_batch: {
          output: {
            indicators: Array.from({ length: started }, (_, index) => ({ _id: `ki-${index}` })),
          },
        },
        search_pending_indicators: searchFailed
          ? { error: { message: 'index_not_found_exception' } }
          : { output: { hits: { hits: [], total: { value: pending } } } },
      },
    });

    it.each([
      [
        'reviews started',
        { inFlight: 2, pending: 9, started: 5 },
        {
          candidates_found: 9,
          degraded: 'false',
          degraded_reason: 'none',
          items_dispatched: 5,
          items_in_flight: '7',
          lookup_failed: false,
          run_outcome: 'produced',
          source_read_failed: false,
        },
      ],
      [
        'an empty queue',
        {},
        {
          candidates_found: 0,
          degraded: 'false',
          degraded_reason: 'none',
          items_dispatched: 0,
          items_in_flight: '0',
          lookup_failed: false,
          run_outcome: 'empty_nothing_pending',
          source_read_failed: false,
        },
      ],
      [
        'a pending queue with no free slot',
        { inFlight: 100, pending: 4 },
        {
          candidates_found: 4,
          degraded: 'true',
          degraded_reason: 'capacity',
          items_dispatched: 0,
          items_in_flight: '100',
          lookup_failed: false,
          run_outcome: 'empty_at_capacity',
          source_read_failed: false,
        },
      ],
      [
        'a failed search',
        { searchFailed: true },
        {
          candidates_found: 0,
          degraded: 'true',
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 0,
          items_in_flight: '0',
          lookup_failed: false,
          run_outcome: 'failed_source_unavailable',
          source_read_failed: true,
        },
      ],
      [
        'a failed active-review lookup the sweep carried on without',
        { lookupFailed: true, pending: 3, started: 3 },
        {
          candidates_found: 3,
          degraded: 'true',
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 3,
          items_in_flight: '3',
          lookup_failed: true,
          run_outcome: 'produced',
          source_read_failed: false,
        },
      ],
    ])('renders %s', (_scenario, scenario, expected) => {
      expect(renderReport(report, sweepContext(scenario))).toEqual(expected);
    });
  });

  describe('the review (coverage_review.yaml)', () => {
    const steps = topLevelSteps(ALERTZERO_COVERAGE_REVIEW_WORKFLOW.yaml);
    const report = stepNamed(steps, 'report_review_completed');

    describeReportStep(
      steps,
      'report_review_completed',
      'rule_coverage_review_completed',
      'emit_result'
    );

    const NOTHING_HAPPENED = {
      applied: false,
      approved_not_applied: false,
      check_failed: false,
      creation_failed: false,
      creation_skipped: false,
      investigation_id: INVESTIGATION_ID,
      ki_processed: false,
      rule_created: false,
    };

    const reviewContext = (
      verdict: string | undefined,
      stepOutputs: Record<string, unknown>
    ): Record<string, unknown> => ({
      steps: {
        coverage_check: { output: { structured_output: { verdict } } },
        create_investigation: verdict ? { output: { conversation_id: INVESTIGATION_ID } } : {},
        ...stepOutputs,
      },
    });

    it.each([
      [
        'an approved enable that landed',
        reviewContext('covered_disabled', {
          mark_processed: { output: { result: 'updated' } },
          propose_enable: { output: { decision: 'approved', status: 'succeeded' } },
          record_decision: { output: { applied: true, approved: true, dismissed: false } },
          refetch_rule: { output: { enabled: true, id: 'rule-so-id' } },
          resolve_outcome: {
            output: { enable_approved_not_applied: false, install_approved_not_applied: false },
          },
        }),
        {
          ...NOTHING_HAPPENED,
          applied: true,
          decision: 'approved',
          ki_processed: true,
          proposal_kind: 'enable_rule',
          verdict: 'covered_disabled',
        },
      ],
      [
        'an approved install that did not land',
        reviewContext('prebuilt_available', {
          propose_install: { output: { decision: 'approved', status: 'succeeded' } },
          record_decision: { output: { applied: true, approved: true, dismissed: false } },
          refetch_rule: { error: { message: 'HTTP 404: not found' } },
          resolve_outcome: {
            output: { enable_approved_not_applied: false, install_approved_not_applied: true },
          },
        }),
        {
          ...NOTHING_HAPPENED,
          approved_not_applied: true,
          decision: 'approved',
          proposal_kind: 'install_prebuilt_rule',
          verdict: 'prebuilt_available',
        },
      ],
      [
        'a created rule',
        reviewContext('no_coverage', {
          mark_processed: { output: { result: 'updated' } },
          record_decision: { output: { applied: false, approved: true, dismissed: false } },
          run_rule_creation: {
            output: { created: true, decision: 'approved', reviewed: true, skip_reason: '' },
          },
        }),
        {
          ...NOTHING_HAPPENED,
          decision: 'approved',
          ki_processed: true,
          proposal_kind: 'create_rule',
          rule_created: true,
          verdict: 'no_coverage',
        },
      ],
      [
        'a rule creation that proposed nothing',
        reviewContext('no_coverage', {
          record_decision: { output: { applied: false, approved: false, dismissed: false } },
          run_rule_creation: {
            output: {
              created: false,
              decision: '',
              reviewed: false,
              skip_reason: 'No data source covers the technique.',
            },
          },
        }),
        {
          ...NOTHING_HAPPENED,
          creation_skipped: true,
          decision: 'none',
          proposal_kind: 'none',
          verdict: 'no_coverage',
        },
      ],
      [
        'a failed rule creation',
        reviewContext('no_coverage', {
          record_decision: { output: { applied: false, approved: false, dismissed: false } },
          run_rule_creation: { error: { message: 'child failed' } },
        }),
        {
          ...NOTHING_HAPPENED,
          creation_failed: true,
          decision: 'none',
          proposal_kind: 'none',
          verdict: 'no_coverage',
        },
      ],
      [
        'a dismissed confirmation',
        reviewContext('covered_enabled', {
          propose_confirm: { output: { decision: 'dismissed', status: 'no_action' } },
          record_decision: { output: { applied: false, approved: false, dismissed: true } },
        }),
        {
          ...NOTHING_HAPPENED,
          decision: 'dismissed',
          proposal_kind: 'confirm_coverage',
          verdict: 'covered_enabled',
        },
      ],
      [
        'a manual follow-up nobody decided',
        reviewContext('covered_disabled', {
          record_decision: { output: { applied: false, approved: false, dismissed: false } },
          report_unresolved_rule: { output: { status: 'expired' } },
        }),
        {
          ...NOTHING_HAPPENED,
          decision: 'undecided',
          proposal_kind: 'manual_follow_up',
          verdict: 'covered_disabled',
        },
      ],
      [
        'a verdict outside the vocabulary',
        reviewContext('partially_covered', {
          record_decision: { output: { applied: false, approved: true, dismissed: false } },
          report_unknown_verdict: { output: { decision: 'approved', status: 'no_action' } },
        }),
        {
          ...NOTHING_HAPPENED,
          decision: 'approved',
          proposal_kind: 'manual_follow_up',
          verdict: 'none',
        },
      ],
      [
        'a check that returned no verdict',
        reviewContext(undefined, {
          record_decision: { output: { applied: false, approved: false, dismissed: false } },
        }),
        {
          ...NOTHING_HAPPENED,
          check_failed: true,
          decision: 'none',
          investigation_id: '',
          proposal_kind: 'none',
          verdict: 'none',
        },
      ],
    ])('renders %s', (_scenario, context, expected) => {
      expect(renderReport(report, context)).toEqual(expected);
    });

    it('sends the free-text outputs only as flags', () => {
      expect(JSON.stringify(report.with)).not.toMatch(
        /check_error|creation_error|rule_name|rationale|\{\{ steps\.run_rule_creation\.output\.skip_reason \}\}/
      );
    });
  });
});

describe('Alert Triage outcome reports', () => {
  describe('the Worker (floor_alert_triage.yaml)', () => {
    const steps = topLevelSteps(
      ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW.yamlTemplate({
        autonomyLevel: 'manual',
        extras: { autoCloseConfidenceScoreMinThreshold: 0.85 },
        settingsVersion: 1,
      })
    );
    const names = steps.map(({ name }) => name);
    const batchReport = stepNamed(steps, 'report_batch_classified');
    const runReport = stepNamed(steps, 'report_worker_run_completed');

    describeReportStep(
      steps,
      'report_batch_classified',
      'alert_triage_batch_classified',
      'attach_impact_gate'
    );

    it('reports the batch once its counts and false-positive candidates are known', () => {
      expect(names.indexOf('report_batch_classified')).toBeGreaterThan(
        names.indexOf('compute_classification_guard_counts')
      );
    });

    it('reports the run as the last step', () => {
      expect({
        continue: runReport['on-failure']?.continue,
        event: runReport.with?.event,
        last: names[names.length - 1],
        timeout: runReport.timeout,
      }).toEqual({
        continue: true,
        event: 'worker_run_completed',
        last: 'report_worker_run_completed',
        timeout: '30s',
      });
    });

    const batchContext = ({
      alerts,
      fpCandidates = 0,
      reviewDispatch,
      verdicts,
    }: {
      alerts: number;
      fpCandidates?: number;
      reviewDispatch?: 'started' | 'limit';
      verdicts: { fp: number; inconclusive: number; tp: number };
    }): Record<string, unknown> => ({
      steps: {
        classify_alerts: {
          output: {
            false_positive_count: verdicts.fp,
            inconclusive_count: verdicts.inconclusive,
            true_positive_count: verdicts.tp,
          },
        },
        create_investigation: { output: { conversation_id: INVESTIGATION_ID } },
      },
      variables: {
        alert_count: alerts,
        fp_candidate_count: fpCandidates,
        verdict_count: verdicts.fp + verdicts.inconclusive + verdicts.tp,
        ...(reviewDispatch ? { review_dispatch: reviewDispatch } : {}),
      },
    });

    it('renders a classified batch', () => {
      expect(
        renderReport(
          batchReport,
          batchContext({
            alerts: 40,
            fpCandidates: 20,
            verdicts: { fp: 23, inconclusive: 5, tp: 10 },
          })
        )
      ).toEqual({
        alerts_total: 40,
        alerts_without_verdict: 2,
        fp_below_floor: 3,
        fp_candidates: 20,
        investigation_id: INVESTIGATION_ID,
        verdicts_false_positive: 23,
        verdicts_inconclusive: 5,
        verdicts_true_positive: 10,
      });
    });

    it('counts every alert of a batch that came back without verdicts', () => {
      expect(
        renderReport(batchReport, {
          steps: { classify_alerts: { output: { verdicts: [] } } },
          variables: { alert_count: 7, fp_candidate_count: 0, verdict_count: 0 },
        })
      ).toEqual(
        expect.objectContaining({
          alerts_total: 7,
          alerts_without_verdict: 7,
          fp_below_floor: 0,
          verdicts_false_positive: 0,
        })
      );
    });

    it.each([
      [
        'a batch handed to the closure review',
        {
          alerts: 40,
          fpCandidates: 20,
          reviewDispatch: 'started' as const,
          verdicts: { fp: 20, inconclusive: 10, tp: 10 },
        },
        {
          candidates_found: 40,
          degraded: 'false',
          degraded_reason: 'none',
          items_dispatched: 40,
          items_failed: 0,
          items_in_flight: '20',
          run_outcome: 'produced',
        },
      ],
      [
        'a batch with no false-positive candidate',
        { alerts: 5, verdicts: { fp: 1, inconclusive: 0, tp: 4 } },
        {
          candidates_found: 5,
          degraded: 'false',
          degraded_reason: 'none',
          items_dispatched: 5,
          items_failed: 0,
          items_in_flight: '0',
          run_outcome: 'produced',
        },
      ],
      [
        'a batch whose closure proposal the per-rule limit held back',
        {
          alerts: 4,
          fpCandidates: 4,
          reviewDispatch: 'limit' as const,
          verdicts: { fp: 4, inconclusive: 0, tp: 0 },
        },
        {
          candidates_found: 4,
          degraded: 'true',
          degraded_reason: 'capacity',
          items_dispatched: 4,
          items_failed: 0,
          items_in_flight: '0',
          run_outcome: 'degraded_partial',
        },
      ],
      [
        'a batch with some alerts missing a verdict',
        { alerts: 10, verdicts: { fp: 0, inconclusive: 2, tp: 6 } },
        {
          candidates_found: 10,
          degraded: 'true',
          degraded_reason: 'missing_data',
          items_dispatched: 8,
          items_failed: 2,
          items_in_flight: '0',
          run_outcome: 'degraded_partial',
        },
      ],
      [
        'a batch that came back without any verdict',
        { alerts: 10, verdicts: { fp: 0, inconclusive: 0, tp: 0 } },
        {
          candidates_found: 10,
          degraded: 'true',
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 0,
          items_failed: 10,
          items_in_flight: '0',
          run_outcome: 'failed_all_items',
        },
      ],
      [
        'an empty batch',
        { alerts: 0, verdicts: { fp: 0, inconclusive: 0, tp: 0 } },
        {
          candidates_found: 0,
          degraded: 'false',
          degraded_reason: 'none',
          items_dispatched: 0,
          items_failed: 0,
          items_in_flight: '0',
          run_outcome: 'empty_nothing_pending',
        },
      ],
    ])('renders the run for %s', (_scenario, scenario, expected) => {
      expect(renderReport(runReport, batchContext(scenario))).toEqual(expected);
    });

    it('sends no alert content', () => {
      expect(JSON.stringify([batchReport.with, runReport.with])).not.toMatch(
        /rationale|rule\.name|event\.alerts\[|verdicts \|/
      );
    });
  });

  describe('the closure review (floor_alert_triage_review.yaml)', () => {
    const steps = topLevelSteps(ALERTZERO_FLOOR_ALERT_TRIAGE_REVIEW_WORKFLOW.yaml);
    const names = steps.map(({ name }) => name);
    const report = stepNamed(steps, 'report_closure_resolved');

    it('reports the settled closure as the last step, after every outcome branch', () => {
      expect({
        continue: report['on-failure']?.continue,
        event: report.with?.event,
        last: names[names.length - 1],
        timeout: report.timeout,
      }).toEqual({
        continue: true,
        event: 'alert_triage_closure_resolved',
        last: 'report_closure_resolved',
        timeout: '30s',
      });
    });

    const reviewContext = ({
      autonomy = 'manual',
      failedRetag,
      outcome,
      readFailed = false,
    }: {
      autonomy?: string;
      failedRetag?: number;
      outcome: string;
      readFailed?: boolean;
    }): Record<string, unknown> => ({
      inputs: { autonomy, conversation_id: INVESTIGATION_ID },
      steps: {
        get_proposal: readFailed ? { error: { message: 'HTTP 503' } } : { output: {} },
      },
      variables: {
        fp_candidate_count: 12,
        proposal_outcome: outcome,
        ...(failedRetag === undefined ? {} : { failed_retag_count: failedRetag }),
      },
    });

    it.each([
      [
        'an auto-approved closure',
        { autonomy: 'supervised', outcome: 'approved' },
        { auto_approve_requested: true, outcome: 'approved' },
      ],
      [
        'a dismissal whose re-tag partly failed',
        { failedRetag: 3, outcome: 'dismissed' },
        { alerts_retag_failed: 3, outcome: 'dismissed' },
      ],
      [
        'a dismissal whose proposal could not be read back',
        { outcome: 'dismissed', readFailed: true },
        { outcome: 'dismissed', proposal_read_failed: true },
      ],
      ['an expired proposal', { outcome: 'expired' }, { outcome: 'expired' }],
      ['an unknown gate state', { outcome: 'unknown' }, { outcome: 'unknown' }],
      ['a value outside the vocabulary', { outcome: 'failed' }, { outcome: 'unknown' }],
    ])('renders %s', (_scenario, scenario, expected) => {
      expect(renderReport(report, reviewContext(scenario))).toEqual({
        alerts_proposed: 12,
        alerts_retag_failed: 0,
        auto_approve_requested: false,
        investigation_id: INVESTIGATION_ID,
        proposal_read_failed: false,
        ...expected,
      });
    });
  });
});

describe('Continuous Threat Hunt outcome reports', () => {
  describe('the Worker (hunt_continuous_threat_hunt.yaml)', () => {
    const steps = topLevelSteps(
      ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW.yamlTemplate({
        autonomyLevel: 'assisted',
        scheduleInterval: '4h',
        settingsVersion: 1,
      })
    );
    const names = steps.map(({ name }) => name);
    const fanOut = stepNamed(steps, 'report_fan_out');
    const branch = fanOut.steps ?? [];
    const report = stepNamed(steps, 'report_worker_run_completed');

    it('records each report outcome as the last, atomic step of its branch', () => {
      const record = branch[branch.length - 1];

      expect({
        keys: Object.keys(record).sort(),
        name: record.name,
        outcome: record.with?.outcome,
        type: record.type,
      }).toEqual({
        keys: ['name', 'type', 'with'],
        name: 'record_report_outcome',
        outcome: '{{ steps.resolve_run_outcome.output.outcome }}',
        type: 'data.set',
      });
    });

    it('passes whether the hunt ran Tier 2 to packaging as a boolean', () => {
      const packageReport = stepNamed(branch, 'package_report');
      const inputs = packageReport.with?.inputs as Record<string, unknown>;

      expect(
        [{ tier2_invoked: true }, { tier2_invoked: false }, undefined].map((output) =>
          renderValue(inputs.tier2Invoked, { steps: { hunt: output ? { output } : {} } })
        )
      ).toEqual([true, false, false]);
    });

    it('reports the run as the last top-level step, after the fan-out', () => {
      expect({
        continue: report['on-failure']?.continue,
        event: report.with?.event,
        guard: report.if,
        last: names[names.length - 1],
        previous: names[names.length - 2],
        timeout: report.timeout,
      }).toEqual({
        continue: true,
        event: 'worker_run_completed',
        guard: undefined,
        last: 'report_worker_run_completed',
        previous: 'report_fan_out',
        timeout: '30s',
      });
    });

    const sweepContext = ({
      branchesFailed = 0,
      ids,
      outcomes = [],
      scope = 'ok',
      scopeFailed = false,
      selectFailed = false,
    }: {
      branchesFailed?: number;
      ids?: readonly string[];
      outcomes?: ReadonlyArray<'completed' | 'partial' | 'failed'>;
      scope?: 'ok' | 'degraded' | 'blocked';
      scopeFailed?: boolean;
      selectFailed?: boolean;
    }): Record<string, unknown> => {
      const blocked = scopeFailed || scope === 'blocked';
      return {
        steps: {
          check_index_scope: scopeFailed
            ? { error: { message: 'HTTP 500' } }
            : { output: { status: scope } },
          resolve_index_scope_gate: { output: { index_scope_blocked: blocked } },
          ...(blocked
            ? {}
            : {
                select_candidate_reports: selectFailed
                  ? { error: { message: 'HTTP 500' } }
                  : { output: { ids: ids ?? outcomes.map((_, index) => `report-${index}`) } },
              }),
          ...(blocked || selectFailed || outcomes.length + branchesFailed === 0
            ? {}
            : {
                report_fan_out: {
                  output: {
                    failed: branchesFailed,
                    results: [
                      ...outcomes.map((outcome) => ({ output: { outcome }, status: 'completed' })),
                      ...Array.from({ length: branchesFailed }, () => ({ status: 'failed' })),
                    ],
                  },
                },
              }),
        },
      };
    };

    it.each([
      [
        'every report hunted and packaged',
        { outcomes: ['completed', 'completed'] as const },
        {
          candidates_found: 2,
          degraded: 'false',
          degraded_reason: 'none',
          items_dispatched: 2,
          items_failed: '0',
          lookup_failed: false,
          run_outcome: 'produced',
          source_read_failed: false,
        },
      ],
      [
        'a partial hunt among completed ones',
        { outcomes: ['completed', 'partial'] as const },
        {
          candidates_found: 2,
          degraded: 'true',
          degraded_reason: 'other',
          items_dispatched: 2,
          items_failed: '0',
          lookup_failed: false,
          run_outcome: 'degraded_partial',
          source_read_failed: false,
        },
      ],
      [
        'a failed hunt and a failed branch among completed ones',
        { branchesFailed: 1, outcomes: ['completed', 'failed'] as const },
        {
          candidates_found: 2,
          degraded: 'true',
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 3,
          items_failed: '2',
          lookup_failed: false,
          run_outcome: 'degraded_partial',
          source_read_failed: false,
        },
      ],
      [
        'every hunt failed',
        { outcomes: ['failed', 'failed'] as const },
        {
          candidates_found: 2,
          degraded: 'true',
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 2,
          items_failed: '2',
          lookup_failed: false,
          run_outcome: 'failed_all_items',
          source_read_failed: false,
        },
      ],
      [
        'an empty selection',
        { ids: [] },
        {
          candidates_found: 0,
          degraded: 'false',
          degraded_reason: 'none',
          items_dispatched: 0,
          items_failed: '0',
          lookup_failed: false,
          run_outcome: 'empty_nothing_pending',
          source_read_failed: false,
        },
      ],
      [
        'a failed candidate selection',
        { selectFailed: true },
        {
          candidates_found: 0,
          degraded: 'true',
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 0,
          items_failed: '0',
          lookup_failed: false,
          run_outcome: 'failed_source_unavailable',
          source_read_failed: true,
        },
      ],
      [
        'a blocked index scope',
        { scope: 'blocked' as const },
        {
          candidates_found: 0,
          degraded: 'true',
          degraded_reason: 'missing_data',
          items_dispatched: 0,
          items_failed: '0',
          lookup_failed: false,
          run_outcome: 'blocked_precondition',
          source_read_failed: false,
        },
      ],
      [
        'an index scope check that failed',
        { scopeFailed: true },
        {
          candidates_found: 0,
          degraded: 'true',
          degraded_reason: 'dependency_unavailable',
          items_dispatched: 0,
          items_failed: '0',
          lookup_failed: true,
          run_outcome: 'blocked_precondition',
          source_read_failed: false,
        },
      ],
    ])('renders %s', (_scenario, scenario, expected) => {
      expect(renderReport(report, sweepContext(scenario))).toEqual(expected);
    });
  });

  describe('the hunt (hunt.yaml)', () => {
    const steps = topLevelSteps(ALERTZERO_HUNT_WORKFLOW.yaml);

    it('outputs whether the coordinator ran Tier 2', () => {
      const tier2 = stepNamed(steps, 'resolve_result_status').with?.result_tier2_invoked;

      expect(
        ['tier1_and_tier2', 'tier1_only', 'tier2_only_skipped', 'blocked', undefined].map(
          (status) =>
            renderValue(tier2, {
              steps: { run_hunt_coordinator: status ? { output: { status } } : {} },
            })
        )
      ).toEqual([true, false, false, false, false]);
    });

    it('declares and emits the tier2_invoked output', () => {
      const workflow = parse(ALERTZERO_HUNT_WORKFLOW.yaml) as {
        outputs: Array<{ name: string; type: string }>;
      };

      expect({
        declared: workflow.outputs.find(({ name }) => name === 'tier2_invoked'),
        emitted: stepNamed(steps, 'emit_result').with?.tier2_invoked,
      }).toEqual({
        declared: { name: 'tier2_invoked', type: 'boolean' },
        emitted: '${{ variables.result_tier2_invoked }}',
      });
    });
  });

  describe('packaging (hunt_package_report.yaml)', () => {
    const steps = topLevelSteps(ALERTZERO_HUNT_PACKAGE_REPORT_WORKFLOW.yaml);
    const report = stepNamed(steps, 'report_report_completed');

    describeReportStep(steps, 'report_report_completed', 'hunt_report_completed', 'emit_result');

    it('accepts tier2Invoked as an optional boolean input', () => {
      const workflow = parse(ALERTZERO_HUNT_PACKAGE_REPORT_WORKFLOW.yaml) as {
        triggers: Array<{
          inputs: { properties: Record<string, { type: string }>; required: string[] };
        }>;
      };
      const [{ inputs }] = workflow.triggers;

      expect({
        required: inputs.required.includes('tier2Invoked'),
        type: inputs.properties.tier2Invoked?.type,
      }).toEqual({ required: false, type: 'boolean' });
    });

    const packagingContext = ({
      dismissCloseFailed = false,
      dispatchFailed = 0,
      hit = true,
      huntStatus = 'success',
      packaged,
      status = 'success',
      tier2Invoked,
    }: {
      dismissCloseFailed?: boolean;
      dispatchFailed?: number;
      hit?: boolean;
      huntStatus?: string;
      packaged?: Record<string, unknown>;
      status?: string;
      tier2Invoked?: boolean;
    }): Record<string, unknown> => ({
      inputs: {
        hasConfirmedHit: hit,
        huntStatus,
        investigationConversationId: INVESTIGATION_ID,
        ...(tier2Invoked === undefined ? {} : { tier2Invoked }),
      },
      steps: { decide_and_package: packaged ? { output: packaged } : {} },
      variables: {
        dismiss_close_failed: dismissCloseFailed,
        dispatch_failed_count: dispatchFailed,
        package_status: status,
      },
    });

    it.each([
      [
        'packaged proposals after a Tier 2 run',
        {
          packaged: {
            coverage: {
              skipped: [{ reason: 'disabled' }],
              written: [{ kiId: 'a' }, { kiId: 'b' }],
            },
            dismiss: false,
            mintSuppression: 'none',
            proposals: [{}, {}, {}],
            status: 'packaged',
          },
          tier2Invoked: true,
        },
        {
          closed_clean: false,
          coverage_kis_skipped: 1,
          coverage_kis_written: 2,
          has_confirmed_hit: true,
          hunt_status: 'success',
          investigation_id: INVESTIGATION_ID,
          mint_suppression: 'none',
          package_status: 'success',
          proposals_dispatch_failed: 0,
          proposals_prepared: 3,
          tier2_invoked: true,
        },
      ],
      [
        'a clean run closed as benign',
        {
          hit: false,
          packaged: {
            coverage: { skipped: [], written: [] },
            dismiss: true,
            mintSuppression: 'none',
            proposals: [],
            status: 'packaged',
          },
          tier2Invoked: false,
        },
        {
          closed_clean: true,
          coverage_kis_skipped: 0,
          coverage_kis_written: 0,
          has_confirmed_hit: false,
          hunt_status: 'success',
          investigation_id: INVESTIGATION_ID,
          mint_suppression: 'none',
          package_status: 'success',
          proposals_dispatch_failed: 0,
          proposals_prepared: 0,
          tier2_invoked: false,
        },
      ],
      [
        'a clean run whose benign close failed',
        {
          dismissCloseFailed: true,
          hit: false,
          packaged: {
            coverage: { skipped: [], written: [] },
            dismiss: true,
            mintSuppression: 'none',
            proposals: [],
            status: 'packaged',
          },
          status: 'run_incomplete',
        },
        {
          closed_clean: false,
          coverage_kis_skipped: 0,
          coverage_kis_written: 0,
          has_confirmed_hit: false,
          hunt_status: 'success',
          investigation_id: INVESTIGATION_ID,
          mint_suppression: 'none',
          package_status: 'run_incomplete',
          proposals_dispatch_failed: 0,
          proposals_prepared: 0,
          tier2_invoked: undefined,
        },
      ],
      [
        'proposals held back by an existing one, with a gate that failed to launch',
        {
          dispatchFailed: 1,
          packaged: {
            coverage: { skipped: [], written: [] },
            dismiss: false,
            mintSuppression: 'existing_proposals',
            proposals: [],
            status: 'packaged',
          },
          status: 'run_incomplete',
        },
        {
          closed_clean: false,
          coverage_kis_skipped: 0,
          coverage_kis_written: 0,
          has_confirmed_hit: true,
          hunt_status: 'success',
          investigation_id: INVESTIGATION_ID,
          mint_suppression: 'existing_proposals',
          package_status: 'run_incomplete',
          proposals_dispatch_failed: 1,
          proposals_prepared: 0,
          tier2_invoked: undefined,
        },
      ],
      [
        'a run packaging did not complete, after a hunt status outside the vocabulary',
        { hit: false, huntStatus: 'aborted', status: 'run_incomplete' },
        {
          closed_clean: false,
          coverage_kis_skipped: 0,
          coverage_kis_written: 0,
          has_confirmed_hit: false,
          hunt_status: 'unknown',
          investigation_id: INVESTIGATION_ID,
          mint_suppression: 'none',
          package_status: 'run_incomplete',
          proposals_dispatch_failed: 0,
          proposals_prepared: 0,
          tier2_invoked: undefined,
        },
      ],
    ])('renders %s', (_scenario, scenario, expected) => {
      expect(renderReport(report, packagingContext(scenario))).toEqual(expected);
    });

    it('sends no report, host or proposal text', () => {
      expect(JSON.stringify(report.with)).not.toMatch(
        /reportId|closureSummary|proposalBullets|package_summary|package_reason|title|comment/
      );
    });
  });
});
