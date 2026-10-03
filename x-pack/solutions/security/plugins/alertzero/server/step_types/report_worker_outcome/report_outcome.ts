/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReportWorkerOutcomeStepInput } from '../../../common/step_types';
import type { AlertZeroEnvelope, AlertZeroTelemetryReporter } from '../../telemetry';
import { ALERTZERO_TELEMETRY_EVENTS } from '../../telemetry';

export interface ReportOutcomeParams {
  envelope: AlertZeroEnvelope;
  input: ReportWorkerOutcomeStepInput;
  report: AlertZeroTelemetryReporter;
}

/** Drops keys whose value is `undefined`, so optional event fields are omitted, not sent empty. */
const omitUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

/** Reports the event a parsed step input names, on top of the run's envelope. */
export const reportOutcome = ({ envelope, input, report }: ReportOutcomeParams): boolean => {
  switch (input.event) {
    case 'ad_worker_run_completed': {
      const { event: _event, ...fields } = input;
      return report(ALERTZERO_TELEMETRY_EVENTS.AdWorkerRunCompleted, {
        ...envelope,
        ...omitUndefined(fields),
      });
    }
    case 'ad_worker_review_started': {
      const { event: _event, ...fields } = input;
      return report(ALERTZERO_TELEMETRY_EVENTS.AdWorkerReviewStarted, {
        ...envelope,
        ...omitUndefined(fields),
      });
    }
    case 'ad_worker_analysis_completed': {
      const { event: _event, ...fields } = input;
      return report(ALERTZERO_TELEMETRY_EVENTS.AdWorkerAnalysisCompleted, {
        ...envelope,
        ...omitUndefined(fields),
      });
    }
    case 'ad_worker_handoff_resolved': {
      const { event: _event, ...fields } = input;
      return report(ALERTZERO_TELEMETRY_EVENTS.AdWorkerHandoffResolved, {
        ...envelope,
        ...omitUndefined(fields),
      });
    }
  }
};
