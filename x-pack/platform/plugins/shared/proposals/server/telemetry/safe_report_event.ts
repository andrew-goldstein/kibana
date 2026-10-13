/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup, AnalyticsServiceStart, Logger } from '@kbn/core/server';
import type { ProposalsTelemetryEventType } from './constants';
import type { ProposalsTelemetryEventPayloads } from './event_types';

/** The `reportEvent` half of core analytics; the setup and start contracts both provide it. */
export type ProposalsTelemetryAnalytics = Pick<
  AnalyticsServiceSetup | AnalyticsServiceStart,
  'reportEvent'
>;

export interface SafeReportEventParams<T extends ProposalsTelemetryEventType> {
  analytics: ProposalsTelemetryAnalytics;
  eventType: T;
  logger: Logger;
  payload: ProposalsTelemetryEventPayloads[T];
}

/**
 * Reports a proposals event, never throwing: telemetry must never fail the write it follows.
 * Returns whether `reportEvent` accepted the event.
 */
export type ProposalsTelemetryReporter = <T extends ProposalsTelemetryEventType>(
  eventType: T,
  payload: ProposalsTelemetryEventPayloads[T]
) => boolean;

/**
 * Reports a proposals event and swallows any error, returning whether it was reported.
 * `reportEvent` is synchronous and throws on an unregistered type in every mode, and on a schema
 * mismatch in dev.
 */
export const safeReportEvent = <T extends ProposalsTelemetryEventType>({
  analytics,
  eventType,
  logger,
  payload,
}: SafeReportEventParams<T>): boolean => {
  try {
    analytics.reportEvent(eventType, payload);
    return true;
  } catch (error) {
    logger.debug(
      () =>
        `Failed to report telemetry event ${eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`
    );
    return false;
  }
};

/** Binds `safeReportEvent` to an analytics contract and logger. */
export const createProposalsTelemetryReporter = ({
  analytics,
  logger,
}: {
  analytics: ProposalsTelemetryAnalytics;
  logger: Logger;
}): ProposalsTelemetryReporter => {
  return (eventType, payload) => safeReportEvent({ analytics, eventType, logger, payload });
};
