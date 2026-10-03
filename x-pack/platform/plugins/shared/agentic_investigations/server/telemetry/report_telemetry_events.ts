/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { AgenticInvestigationsTelemetryEvent } from './event_types';
import type { AgenticInvestigationsTelemetryReporter } from './safe_report_event';

export interface ReportTelemetryEventsParams {
  /** Builds the events from the completed write. Called only when a reporter is configured. */
  buildEvents: () => readonly AgenticInvestigationsTelemetryEvent[];
  logger: Logger;
  telemetry: AgenticInvestigationsTelemetryReporter | undefined;
}

/**
 * Builds and reports the events that follow a completed write, never throwing: a failure while
 * building or reporting is logged at debug level and cannot fail the write.
 */
export const reportTelemetryEvents = ({
  buildEvents,
  logger,
  telemetry,
}: ReportTelemetryEventsParams): void => {
  if (!telemetry) {
    return;
  }
  try {
    buildEvents().forEach(({ eventType, payload }) => telemetry(eventType, payload));
  } catch (error) {
    logger.debug(
      () =>
        `Failed to build or report agentic_investigations telemetry: ${
          error instanceof Error ? error.message : String(error)
        }`
    );
  }
};
