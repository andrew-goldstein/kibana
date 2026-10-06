/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup, AnalyticsServiceStart, Logger } from '@kbn/core/server';
import type { AgenticInvestigationsTelemetryEventType } from './constants';
import type { AgenticInvestigationsTelemetryEventPayloads } from './event_types';

/** The `reportEvent` half of core analytics; the setup and start contracts both provide it. */
export type AgenticInvestigationsTelemetryAnalytics = Pick<
  AnalyticsServiceSetup | AnalyticsServiceStart,
  'reportEvent'
>;

export interface SafeReportEventParams<T extends AgenticInvestigationsTelemetryEventType> {
  analytics: AgenticInvestigationsTelemetryAnalytics;
  eventType: T;
  logger: Logger;
  payload: AgenticInvestigationsTelemetryEventPayloads[T];
}

/** Reports an agentic_investigations event, never throwing: telemetry must never fail a write. */
export type AgenticInvestigationsTelemetryReporter = <
  T extends AgenticInvestigationsTelemetryEventType
>(
  eventType: T,
  payload: AgenticInvestigationsTelemetryEventPayloads[T]
) => void;

/**
 * Reports an agentic_investigations event and swallows any error. `reportEvent` is synchronous
 * and throws on an unregistered type in every mode, and on a schema mismatch in dev.
 */
export const safeReportEvent = <T extends AgenticInvestigationsTelemetryEventType>({
  analytics,
  eventType,
  logger,
  payload,
}: SafeReportEventParams<T>): void => {
  try {
    analytics.reportEvent(eventType, payload);
  } catch (error) {
    logger.debug(
      () =>
        `Failed to report telemetry event ${eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`
    );
  }
};

/** Binds `safeReportEvent` to an analytics contract and logger. */
export const createAgenticInvestigationsTelemetryReporter = ({
  analytics,
  logger,
}: {
  analytics: AgenticInvestigationsTelemetryAnalytics;
  logger: Logger;
}): AgenticInvestigationsTelemetryReporter => {
  return (eventType, payload) => safeReportEvent({ analytics, eventType, logger, payload });
};
