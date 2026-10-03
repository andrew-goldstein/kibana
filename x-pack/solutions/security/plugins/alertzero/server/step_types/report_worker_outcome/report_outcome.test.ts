/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertZeroEnvelope } from '../../telemetry';
import { ALERTZERO_TELEMETRY_EVENTS } from '../../telemetry';
import { reportOutcome } from './report_outcome';

const envelope: AlertZeroEnvelope = {
  execution_id: 'exec-review',
  is_default_space: true,
  run_id: 'exec-root',
  trigger_type: 'scheduled',
  watch_tag: 'watch-floor',
  worker_id: 'system-security-floor-attack-discovery',
};

describe('reportOutcome', () => {
  it.each([
    [
      ALERTZERO_TELEMETRY_EVENTS.AdWorkerRunCompleted,
      {
        alerts_analyzed: 1,
        attacks_generated: 1,
        attacks_persisted: 1,
        batches_failed: 0,
        batches_total: 1,
        event: 'ad_worker_run_completed' as const,
        run_outcome: 'produced' as const,
      },
    ],
    [
      ALERTZERO_TELEMETRY_EVENTS.AdWorkerReviewStarted,
      { event: 'ad_worker_review_started' as const },
    ],
    [
      ALERTZERO_TELEMETRY_EVENTS.AdWorkerAnalysisCompleted,
      {
        analysis_error: false,
        event: 'ad_worker_analysis_completed' as const,
        verdict: 'failed' as const,
      },
    ],
    [
      ALERTZERO_TELEMETRY_EVENTS.AdWorkerHandoffResolved,
      { event: 'ad_worker_handoff_resolved' as const, outcome: 'expired' as const },
    ],
    [
      ALERTZERO_TELEMETRY_EVENTS.AdWorkerInvestigationClosed,
      {
        close_reason: 'other' as const,
        event: 'ad_worker_investigation_closed' as const,
        investigation_id: '0b9f4a3e-1c2d-8e3f-8a4b-5c6d7e8f9a0b',
      },
    ],
  ])('reports %s for its input event', (eventType, input) => {
    const report = jest.fn().mockReturnValue(true);

    reportOutcome({ envelope, input, report });

    expect(report.mock.calls[0][0]).toBe(eventType);
  });

  it('merges the envelope and drops the discriminator', () => {
    const report = jest.fn().mockReturnValue(true);

    reportOutcome({
      envelope,
      input: { analysis_error: true, event: 'ad_worker_analysis_completed', verdict: 'failed' },
      report,
    });

    expect(report.mock.calls[0][1]).toEqual({
      ...envelope,
      analysis_error: true,
      verdict: 'failed',
    });
  });

  it('reports an Investigation close with its id and reason on top of the envelope', () => {
    const report = jest.fn().mockReturnValue(true);

    reportOutcome({
      envelope,
      input: {
        close_reason: 'false_positive',
        event: 'ad_worker_investigation_closed',
        investigation_id: '0b9f4a3e-1c2d-8e3f-8a4b-5c6d7e8f9a0b',
      },
      report,
    });

    expect(report.mock.calls).toEqual([
      [
        ALERTZERO_TELEMETRY_EVENTS.AdWorkerInvestigationClosed,
        {
          ...envelope,
          close_reason: 'false_positive',
          investigation_id: '0b9f4a3e-1c2d-8e3f-8a4b-5c6d7e8f9a0b',
        },
      ],
    ]);
  });

  it('omits optional fields the input left undefined', () => {
    const report = jest.fn().mockReturnValue(true);

    reportOutcome({
      envelope,
      input: {
        auto_approve_requested: undefined,
        event: 'ad_worker_handoff_resolved',
        outcome: 'approved',
        verdict: undefined,
      },
      report,
    });

    expect(Object.keys(report.mock.calls[0][1])).not.toEqual(
      expect.arrayContaining(['auto_approve_requested'])
    );
  });

  it('returns whether the reporter reported', () => {
    const report = jest.fn().mockReturnValue(false);

    expect(reportOutcome({ envelope, input: { event: 'ad_worker_review_started' }, report })).toBe(
      false
    );
  });
});
