/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { PROPOSALS_TELEMETRY_EVENTS } from './constants';
import type { ProposalsProposalRetriedPayload } from './event_types';
import { createProposalsTelemetryReporter, safeReportEvent } from './safe_report_event';

const payload: ProposalsProposalRetriedPayload = {
  attempt: 2,
  is_default_space: true,
  managed_caller: false,
  origin: 'alertzero',
  proposal_id: 'proposal-2',
  root_proposal_id: 'proposal-1',
};

const createDeps = () => ({
  analytics: coreMock.createSetup().analytics,
  logger: loggerMock.create(),
});

describe('safeReportEvent', () => {
  it('reports the event type and payload through core analytics', () => {
    const { analytics, logger } = createDeps();

    safeReportEvent({
      analytics,
      eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      logger,
      payload,
    });

    expect(analytics.reportEvent).toHaveBeenCalledWith(
      PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      payload
    );
  });

  it('does not throw when reportEvent throws', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('Attempted to report event type before registering it');
    });

    expect(() =>
      safeReportEvent({
        analytics,
        eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
        logger,
        payload,
      })
    ).not.toThrow();
  });

  it('logs the failure lazily at debug level', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('boom');
    });

    safeReportEvent({
      analytics,
      eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      logger,
      payload,
    });

    expect(logger.debug).toHaveBeenCalledWith(expect.any(Function));
  });

  it('names the event type and the error in the debug message', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('boom');
    });

    safeReportEvent({
      analytics,
      eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      logger,
      payload,
    });
    const message = (logger.debug.mock.calls[0][0] as () => string)();

    expect(message).toBe(
      `Failed to report telemetry event ${PROPOSALS_TELEMETRY_EVENTS.ProposalRetried}: boom`
    );
  });

  it('describes a non-Error throw in the debug message', () => {
    const { analytics, logger } = createDeps();
    const notAnError: unknown = 'not an error';
    analytics.reportEvent.mockImplementation(() => {
      throw notAnError;
    });

    safeReportEvent({
      analytics,
      eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      logger,
      payload,
    });
    const message = (logger.debug.mock.calls[0][0] as () => string)();

    expect(message).toBe(
      `Failed to report telemetry event ${PROPOSALS_TELEMETRY_EVENTS.ProposalRetried}: not an error`
    );
  });

  it('returns true when the event is reported', () => {
    const { analytics, logger } = createDeps();

    const reported = safeReportEvent({
      analytics,
      eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      logger,
      payload,
    });

    expect(reported).toBe(true);
  });

  it('returns false when reportEvent throws', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('boom');
    });

    const reported = safeReportEvent({
      analytics,
      eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      logger,
      payload,
    });

    expect(reported).toBe(false);
  });

  it('does not log when the event is reported', () => {
    const { analytics, logger } = createDeps();

    safeReportEvent({
      analytics,
      eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      logger,
      payload,
    });

    expect(logger.debug).not.toHaveBeenCalled();
  });
});

describe('createProposalsTelemetryReporter', () => {
  it('returns a reporter bound to the analytics service', () => {
    const { analytics, logger } = createDeps();
    const reportEvent = createProposalsTelemetryReporter({ analytics, logger });

    reportEvent(PROPOSALS_TELEMETRY_EVENTS.ProposalRetried, payload);

    expect(analytics.reportEvent).toHaveBeenCalledWith(
      PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
      payload
    );
  });

  it('returns a reporter that never throws', () => {
    const { analytics, logger } = createDeps();
    analytics.reportEvent.mockImplementation(() => {
      throw new Error('boom');
    });
    const reportEvent = createProposalsTelemetryReporter({ analytics, logger });

    expect(() => reportEvent(PROPOSALS_TELEMETRY_EVENTS.ProposalRetried, payload)).not.toThrow();
  });

  it('returns a reporter that tells whether the event was reported', () => {
    const { analytics, logger } = createDeps();
    const reportEvent = createProposalsTelemetryReporter({ analytics, logger });

    expect(reportEvent(PROPOSALS_TELEMETRY_EVENTS.ProposalRetried, payload)).toBe(true);
  });
});
