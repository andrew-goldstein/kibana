/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { BuildEscalationClosedEventsParams } from './build_escalation_closed_events';
import { buildEscalationClosedEvents } from './build_escalation_closed_events';

const ESCALATION_ID = '9a7b6c5d-4e3f-4a1b-8c2d-0e1f2a3b4c5d';

const params: BuildEscalationClosedEventsParams = {
  changedFields: ['status'],
  createdAt: '2026-09-27T12:00:00.000Z',
  escalationId: ESCALATION_ID,
  investigationsClosed: 2,
  isDefaultSpace: true,
  linkedInvestigationCount: 3,
  nextStatus: 'closed',
  now: Date.parse('2026-09-28T12:00:00.000Z'),
};

describe('buildEscalationClosedEvents', () => {
  it('reports the close with the cascade count and time open', () => {
    expect(buildEscalationClosedEvents(params)).toEqual([
      {
        eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed,
        payload: {
          escalation_id: ESCALATION_ID,
          investigations_closed: 2,
          is_default_space: true,
          linked_investigation_count: 3,
          time_open_ms: 86_400_000,
        },
      },
    ]);
  });

  it('reports nothing when the escalation was already closed', () => {
    expect(buildEscalationClosedEvents({ ...params, changedFields: [] })).toEqual([]);
  });

  it('reports nothing when the escalation is reopened', () => {
    expect(buildEscalationClosedEvents({ ...params, nextStatus: 'open' })).toEqual([]);
  });

  it('omits time_open_ms when the creation time cannot be read', () => {
    const [event] = buildEscalationClosedEvents({ ...params, createdAt: undefined });

    expect(event.payload).not.toHaveProperty('time_open_ms');
  });
});
