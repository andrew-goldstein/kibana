/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { StepCategory } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import {
  AD_WORKER_ANALYSIS_VERDICTS,
  AD_WORKER_HANDOFF_OUTCOMES,
  AD_WORKER_RUN_OUTCOMES,
} from '../telemetry/constants';
import {
  MAX_REPORTED_COUNT,
  REPORT_WORKER_OUTCOME_EVENTS,
  ReportWorkerOutcomeStepId,
  reportWorkerOutcomeStepCommonDefinition,
  reportWorkerOutcomeStepInputSchema,
  reportWorkerOutcomeStepOutputSchema,
} from './report_worker_outcome_step';

const INVESTIGATION_ID = '0b9f4a3e-1c2d-8e3f-8a4b-5c6d7e8f9a0b';

const parse = (input: unknown) => reportWorkerOutcomeStepInputSchema.safeParse(input);

/** The parsed `ad_worker_review_started` branch, or undefined when the input did not parse to it. */
const parseReviewStarted = (input: Record<string, unknown>) => {
  const result = parse({ event: 'ad_worker_review_started', ...input });
  return result.success && result.data.event === 'ad_worker_review_started'
    ? result.data
    : undefined;
};

describe('alertzero.reportWorkerOutcome common definition', () => {
  it('uses the alertzero step id', () => {
    expect(reportWorkerOutcomeStepCommonDefinition.id).toBe('alertzero.reportWorkerOutcome');
  });

  it('exports the step id constant', () => {
    expect(ReportWorkerOutcomeStepId).toBe(reportWorkerOutcomeStepCommonDefinition.id);
  });

  it('is a beta Kibana step', () => {
    expect({
      category: reportWorkerOutcomeStepCommonDefinition.category,
      stability: reportWorkerOutcomeStepCommonDefinition.stability,
    }).toEqual({ category: StepCategory.Kibana, stability: 'beta' });
  });

  it('documents at least one example', () => {
    expect(reportWorkerOutcomeStepCommonDefinition.documentation?.examples?.length).toBeGreaterThan(
      0
    );
  });

  it('covers only the four Attack Discovery outcome events', () => {
    expect(REPORT_WORKER_OUTCOME_EVENTS).toEqual([
      'ad_worker_run_completed',
      'ad_worker_review_started',
      'ad_worker_analysis_completed',
      'ad_worker_handoff_resolved',
    ]);
  });

  it('outputs only `reported`', () => {
    expect(Object.keys(reportWorkerOutcomeStepOutputSchema.shape)).toEqual(['reported']);
  });
});

describe('alertzero.reportWorkerOutcome input schema', () => {
  describe('ad_worker_run_completed', () => {
    const valid = {
      alerts_analyzed: 120,
      attacks_generated: 4,
      attacks_persisted: 3,
      batches_failed: 1,
      batches_total: 6,
      event: 'ad_worker_run_completed',
      run_outcome: 'produced',
    };

    it('accepts every run outcome', () => {
      const results = AD_WORKER_RUN_OUTCOMES.map(
        (runOutcome) => parse({ ...valid, run_outcome: runOutcome }).success
      );

      expect(results.every(Boolean)).toBe(true);
    });

    it('parses a complete payload unchanged', () => {
      expect(parse(valid)).toEqual({ data: valid, success: true });
    });

    it('defaults a count Liquid rendered as the empty string to 0', () => {
      const result = parse({ ...valid, batches_failed: '' });

      expect(result.success && result.data).toEqual(expect.objectContaining({ batches_failed: 0 }));
    });

    it('defaults an omitted count to 0', () => {
      const { alerts_analyzed: _omitted, ...withoutAlerts } = valid;

      const result = parse(withoutAlerts);

      expect(result.success && result.data).toEqual(
        expect.objectContaining({ alerts_analyzed: 0 })
      );
    });

    it('coerces a count Liquid rendered as an integer string', () => {
      const result = parse({ ...valid, attacks_generated: '4' });

      expect(result.success && result.data).toEqual(
        expect.objectContaining({ attacks_generated: 4 })
      );
    });

    it.each([
      ['a negative count', -1],
      ['a fractional count', 1.5],
      ['a count above the bound', MAX_REPORTED_COUNT + 1],
      ['a non-numeric string', 'many'],
    ])('rejects %s', (_label, value) => {
      expect(parse({ ...valid, alerts_analyzed: value }).success).toBe(false);
    });

    it('rejects an unknown run outcome', () => {
      expect(parse({ ...valid, run_outcome: 'skipped_space_disabled' }).success).toBe(false);
    });

    it('rejects a missing run outcome', () => {
      expect(parse({ ...valid, run_outcome: '' }).success).toBe(false);
    });
  });

  describe('ad_worker_review_started', () => {
    it('accepts an investigation id and a re-review flag', () => {
      const input = {
        event: 'ad_worker_review_started',
        investigation_id: INVESTIGATION_ID,
        is_rereview: true,
      };

      expect(parse(input)).toEqual({ data: input, success: true });
    });

    it('treats an empty investigation id as absent', () => {
      const result = parseReviewStarted({ investigation_id: '' });

      expect(result).toEqual({ event: 'ad_worker_review_started', investigation_id: undefined });
    });

    it('rejects an investigation id that is not a UUID', () => {
      expect(
        parse({ event: 'ad_worker_review_started', investigation_id: 'Suspicious login' }).success
      ).toBe(false);
    });

    it('coerces a re-review flag Liquid rendered as text', () => {
      const result = parseReviewStarted({ is_rereview: 'false' });

      expect(result?.is_rereview).toBe(false);
    });

    it('treats an empty re-review flag as absent', () => {
      const result = parseReviewStarted({ is_rereview: '' });

      expect(result).toEqual({ event: 'ad_worker_review_started', is_rereview: undefined });
    });
  });

  describe('ad_worker_analysis_completed', () => {
    it('accepts every verdict', () => {
      const results = AD_WORKER_ANALYSIS_VERDICTS.map(
        (verdict) => parse({ event: 'ad_worker_analysis_completed', verdict }).success
      );

      expect(results.every(Boolean)).toBe(true);
    });

    it('defaults an empty analysis_error to false', () => {
      const result = parse({
        analysis_error: '',
        event: 'ad_worker_analysis_completed',
        verdict: 'false_positive',
      });

      expect(result.success && result.data).toEqual(
        expect.objectContaining({ analysis_error: false })
      );
    });

    it('coerces analysis_error Liquid rendered as text', () => {
      const result = parse({
        analysis_error: 'true',
        event: 'ad_worker_analysis_completed',
        verdict: 'failed',
      });

      expect(result.success && result.data).toEqual(
        expect.objectContaining({ analysis_error: true })
      );
    });

    it('rejects an unknown verdict', () => {
      expect(parse({ event: 'ad_worker_analysis_completed', verdict: 'maybe' }).success).toBe(
        false
      );
    });
  });

  describe('ad_worker_handoff_resolved', () => {
    it('accepts every handoff outcome', () => {
      const results = AD_WORKER_HANDOFF_OUTCOMES.map(
        (outcome) => parse({ event: 'ad_worker_handoff_resolved', outcome }).success
      );

      expect(results.every(Boolean)).toBe(true);
    });

    it('treats an empty verdict as absent', () => {
      const result = parse({
        event: 'ad_worker_handoff_resolved',
        outcome: 'approved',
        verdict: '',
      });

      expect(result.success && result.data).toEqual(
        expect.objectContaining({ verdict: undefined })
      );
    });

    it('accepts auto_approve_requested', () => {
      const result = parse({
        auto_approve_requested: true,
        event: 'ad_worker_handoff_resolved',
        outcome: 'approved',
        verdict: 'true_positive',
      });

      expect(result.success).toBe(true);
    });

    it('rejects an unknown outcome', () => {
      expect(parse({ event: 'ad_worker_handoff_resolved', outcome: 'escalated' }).success).toBe(
        false
      );
    });
  });

  it('rejects an event outside the union', () => {
    expect(parse({ event: 'rule_tuning_worker_run_completed' }).success).toBe(false);
  });

  it('rejects a free-text field the schema does not declare', () => {
    expect(
      parse({
        event: 'ad_worker_analysis_completed',
        summary: 'Lateral movement from fin-dc-01',
        verdict: 'true_positive',
      }).success
    ).toBe(false);
  });

  it('rejects an id the schema does not declare', () => {
    expect(
      parse({
        event: 'ad_worker_review_started',
        execution_id: INVESTIGATION_ID,
      }).success
    ).toBe(false);
  });

  it('converts to a JSON schema the YAML editor can use', () => {
    const jsonSchema = z.toJSONSchema(reportWorkerOutcomeStepInputSchema, {
      reused: 'ref',
      target: 'draft-7',
      unrepresentable: 'any',
    }) as { oneOf?: Array<{ properties: { event: { const: string } } }> };

    expect(jsonSchema.oneOf?.map(({ properties }) => properties.event.const)).toEqual([
      ...REPORT_WORKER_OUTCOME_EVENTS,
    ]);
  });
});
