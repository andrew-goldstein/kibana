/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAnalytics } from '@elastic/ebt/client';
import { coreMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES } from './event_types';
import { registerAgenticInvestigationsTelemetryEvents } from './register_telemetry_events';

describe('registerAgenticInvestigationsTelemetryEvents', () => {
  it('registers every agentic_investigations event type', () => {
    const { analytics } = coreMock.createSetup();

    registerAgenticInvestigationsTelemetryEvents(analytics);
    const registered = analytics.registerEventType.mock.calls.map(([opts]) => opts.eventType);

    expect(registered.sort()).toEqual(
      Object.values(AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS).sort()
    );
  });

  it('registers each event with its schema', () => {
    const { analytics } = coreMock.createSetup();

    registerAgenticInvestigationsTelemetryEvents(analytics);

    expect(analytics.registerEventType.mock.calls.map(([opts]) => opts)).toEqual(
      AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES
    );
  });

  it('registers schemas a dev-mode analytics client accepts', () => {
    const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });

    expect(() => registerAgenticInvestigationsTelemetryEvents(analytics)).not.toThrow();
  });
});
