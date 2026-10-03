/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { AgenticInvestigationsInvestigationReopenedPayload } from './event_types';
import { createAgenticInvestigationsTelemetryReporter, safeReportEvent } from './safe_report_event';

const EVENT_TYPE = AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened;

const payload: AgenticInvestigationsInvestigationReopenedPayload = {
  investigation_id: '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f',
  is_default_space: true,
};

const createDeps = () => ({
  analytics: coreMock.createSetup().analytics,
  logger: loggingSystemMock.createLogger(),
});

describe('safeReportEvent', () => {
  it('reports the event type and payload through core analytics', () => {
    const { analytics, logger } = createDeps();

    safeReportEvent({ analytics, eventType: EVENT_TYPE, logger, payload });

    expect(analytics.reportEvent).toHaveBeenCalledWith(EVENT_TYPE, payload);
  });

  it('does not throw when reportEvent throws', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('Attempted to report event type before registering it');
    });

    expect(() =>
      safeReportEvent({ analytics, eventType: EVENT_TYPE, logger, payload })
    ).not.toThrow();
  });

  it('logs the failure lazily at debug level', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('boom');
    });

    safeReportEvent({ analytics, eventType: EVENT_TYPE, logger, payload });

    expect(logger.debug).toHaveBeenCalledWith(expect.any(Function));
  });

  it('names the event type and the error in the debug message', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('boom');
    });

    safeReportEvent({ analytics, eventType: EVENT_TYPE, logger, payload });
    const message = (logger.debug.mock.calls[0][0] as () => string)();

    expect(message).toBe(`Failed to report telemetry event ${EVENT_TYPE}: boom`);
  });

  it('describes a non-Error throw in the debug message', () => {
    const { analytics, logger } = createDeps();
    const notAnError: unknown = 'not an error';
    analytics.reportEvent.mockImplementation(() => {
      throw notAnError;
    });

    safeReportEvent({ analytics, eventType: EVENT_TYPE, logger, payload });
    const message = (logger.debug.mock.calls[0][0] as () => string)();

    expect(message).toBe(`Failed to report telemetry event ${EVENT_TYPE}: not an error`);
  });

  it('does not log when the event is reported', () => {
    const { analytics, logger } = createDeps();

    safeReportEvent({ analytics, eventType: EVENT_TYPE, logger, payload });

    expect(logger.debug).not.toHaveBeenCalled();
  });
});

describe('createAgenticInvestigationsTelemetryReporter', () => {
  it('returns a reporter bound to the analytics service', () => {
    const { analytics, logger } = createDeps();
    const reportEvent = createAgenticInvestigationsTelemetryReporter({ analytics, logger });

    reportEvent(EVENT_TYPE, payload);

    expect(analytics.reportEvent).toHaveBeenCalledWith(EVENT_TYPE, payload);
  });

  it('returns a reporter that never throws', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('boom');
    });
    const reportEvent = createAgenticInvestigationsTelemetryReporter({ analytics, logger });

    expect(() => reportEvent(EVENT_TYPE, payload)).not.toThrow();
  });
});
