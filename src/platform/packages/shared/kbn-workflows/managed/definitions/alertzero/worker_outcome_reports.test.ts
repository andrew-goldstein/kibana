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
  ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW,
  ALERTZERO_RULE_TUNING_WORKER_WORKFLOW,
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
