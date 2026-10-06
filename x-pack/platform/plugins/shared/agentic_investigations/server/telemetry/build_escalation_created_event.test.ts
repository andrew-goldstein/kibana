/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { BuildEscalationCreatedEventParams } from './build_escalation_created_event';
import { buildEscalationCreatedEvent } from './build_escalation_created_event';

const params: BuildEscalationCreatedEventParams = {
  assignees: ['user-a', 'user-b'],
  escalationId: '9a7b6c5d-4e3f-4a1b-8c2d-0e1f2a3b4c5d',
  investigationId: '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f',
  isDefaultSpace: true,
  linkedInvestigationCount: 1,
  visibility: 'private',
};

describe('buildEscalationCreatedEvent', () => {
  it('reports the access mode, participant count and linked investigations', () => {
    expect(buildEscalationCreatedEvent(params)).toEqual({
      eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationCreated,
      payload: {
        access_mode: 'private',
        escalation_id: '9a7b6c5d-4e3f-4a1b-8c2d-0e1f2a3b4c5d',
        investigation_id: '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f',
        is_default_space: true,
        linked_investigations_at_create: 1,
        participant_count: 2,
      },
    });
  });

  it('counts a user assigned twice once', () => {
    const { payload } = buildEscalationCreatedEvent({
      ...params,
      assignees: ['user-b', 'user-c', 'user-b'],
    });

    expect(payload).toEqual(expect.objectContaining({ participant_count: 2 }));
  });

  it('counts the assignees of a public escalation', () => {
    const { payload } = buildEscalationCreatedEvent({
      ...params,
      assignees: ['user-a'],
      visibility: 'public',
    });

    expect(payload).toEqual(
      expect.objectContaining({ access_mode: 'public', participant_count: 1 })
    );
  });

  it('never ships the user profile ids', () => {
    const { payload } = buildEscalationCreatedEvent({ ...params, assignees: ['user-c'] });

    expect(JSON.stringify(payload)).not.toMatch(/user-/);
  });
});
