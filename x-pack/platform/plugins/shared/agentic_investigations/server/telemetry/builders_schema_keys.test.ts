/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildEscalationClosedEvents } from './build_escalation_closed_events';
import { buildEscalationCreatedEvent } from './build_escalation_created_event';
import { buildEscalationInvestigationLinkedEvents } from './build_escalation_investigation_linked_events';
import { buildInvestigationStatusEvents } from './build_investigation_status_events';
import type { AgenticInvestigationsTelemetryEvent } from './event_types';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES } from './event_types';

const INVESTIGATION_ID = '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f';
const ESCALATION_ID = '9a7b6c5d-4e3f-4a1b-8c2d-0e1f2a3b4c5d';
const WORKFLOW_EXECUTION_ID = '3f2c9e1a-7b4d-4c8e-9a1f-2d3e4f5a6b7c';
const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const CREATED_AT = '2026-09-28T11:00:00.000Z';

const statusParams = {
  changedFields: ['status'],
  closedBy: 'workflow_request',
  createdAt: CREATED_AT,
  dismissReason: 'false_positive',
  dismissedProposalCount: 1,
  investigationId: INVESTIGATION_ID,
  isDefaultSpace: true,
  now: NOW,
  pendingProposalCount: 2,
  previousStatus: 'open',
  reopenedBy: 'workflow_step',
  workflowExecutionId: WORKFLOW_EXECUTION_ID,
} as const;

/** Every builder, with inputs that fill every optional field it can send. */
const BUILT_EVENTS: ReadonlyArray<[string, readonly AgenticInvestigationsTelemetryEvent[]]> = [
  [
    'investigation closed',
    buildInvestigationStatusEvents({ ...statusParams, nextStatus: 'closed' }),
  ],
  [
    'investigation reopened',
    buildInvestigationStatusEvents({
      ...statusParams,
      nextStatus: 'open',
      previousStatus: 'closed',
    }),
  ],
  [
    'escalation created',
    [
      buildEscalationCreatedEvent({
        assignees: ['user-a', 'user-b'],
        escalationId: ESCALATION_ID,
        investigationId: INVESTIGATION_ID,
        isDefaultSpace: false,
        linkedInvestigationCount: 1,
        visibility: 'private',
      }),
    ],
  ],
  [
    'escalation investigation linked',
    buildEscalationInvestigationLinkedEvents({
      changedFields: ['linked_investigations'],
      escalationId: ESCALATION_ID,
      isDefaultSpace: true,
      nextIds: ['inv-1', 'inv-2'],
      previousIds: ['inv-1'],
    }),
  ],
  [
    'escalation closed',
    buildEscalationClosedEvents({
      changedFields: ['status'],
      createdAt: CREATED_AT,
      escalationId: ESCALATION_ID,
      investigationsClosed: 2,
      isDefaultSpace: true,
      linkedInvestigationCount: 2,
      nextStatus: 'closed',
      now: NOW,
    }),
  ],
];

const schemaKeysByEventType = new Map<string, string[]>(
  AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES.map(({ eventType, schema }) => [
    eventType,
    Object.keys(schema),
  ])
);

// Production never validates payloads against the schema, so the builders must not emit a key
// the schema doesn't declare.
describe('telemetry builders', () => {
  it.each(BUILT_EVENTS)('build at least one %s event', (_name, events) => {
    expect(events.length).toBeGreaterThan(0);
  });

  it.each(BUILT_EVENTS)('emit only keys the %s schema declares', (_name, events) => {
    const undeclared = events.flatMap(({ eventType, payload }) =>
      Object.keys(payload).filter((key) => !schemaKeysByEventType.get(eventType)?.includes(key))
    );

    expect(undeclared).toEqual([]);
  });
});
