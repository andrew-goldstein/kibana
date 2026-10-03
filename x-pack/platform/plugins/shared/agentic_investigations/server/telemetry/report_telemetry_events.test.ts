/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { AgenticInvestigationsTelemetryEvent } from './event_types';
import { reportTelemetryEvents } from './report_telemetry_events';

const event: AgenticInvestigationsTelemetryEvent = {
  eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationOpened,
  payload: { investigation_id: '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f', is_default_space: true },
};

describe('reportTelemetryEvents', () => {
  it('reports every built event', () => {
    const logger = loggingSystemMock.createLogger();
    const telemetry = jest.fn();

    reportTelemetryEvents({ buildEvents: () => [event, event], logger, telemetry });

    expect(telemetry).toHaveBeenCalledTimes(2);
    expect(telemetry).toHaveBeenCalledWith(event.eventType, event.payload);
  });

  it('does not build events when no reporter is configured', () => {
    const logger = loggingSystemMock.createLogger();
    const buildEvents = jest.fn(() => [event]);

    reportTelemetryEvents({ buildEvents, logger, telemetry: undefined });

    expect(buildEvents).not.toHaveBeenCalled();
  });

  it('does not throw when building the events throws', () => {
    const logger = loggingSystemMock.createLogger();

    expect(() =>
      reportTelemetryEvents({
        buildEvents: () => {
          throw new Error('boom');
        },
        logger,
        telemetry: jest.fn(),
      })
    ).not.toThrow();
  });

  it('does not throw when the reporter throws', () => {
    const logger = loggingSystemMock.createLogger();
    const telemetry = jest.fn(() => {
      throw new Error('boom');
    });

    expect(() =>
      reportTelemetryEvents({ buildEvents: () => [event], logger, telemetry })
    ).not.toThrow();
  });

  it('logs a failure lazily at debug level', () => {
    const logger = loggingSystemMock.createLogger();

    reportTelemetryEvents({
      buildEvents: () => {
        throw new Error('boom');
      },
      logger,
      telemetry: jest.fn(),
    });
    const message = (logger.debug.mock.calls[0][0] as () => string)();

    expect(message).toBe('Failed to build or report agentic_investigations telemetry: boom');
  });
});
