/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { BuildEscalationInvestigationLinkedEventsParams } from './build_escalation_investigation_linked_events';
import { buildEscalationInvestigationLinkedEvents } from './build_escalation_investigation_linked_events';

const ESCALATION_ID = '9a7b6c5d-4e3f-4a1b-8c2d-0e1f2a3b4c5d';

const params: BuildEscalationInvestigationLinkedEventsParams = {
  changedFields: ['linked_investigations'],
  escalationId: ESCALATION_ID,
  isDefaultSpace: false,
  nextIds: ['inv-1', 'inv-2', 'inv-3'],
  previousIds: ['inv-1'],
};

describe('buildEscalationInvestigationLinkedEvents', () => {
  it('reports one event per newly linked investigation', () => {
    expect(buildEscalationInvestigationLinkedEvents(params)).toEqual([
      {
        eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationInvestigationLinked,
        payload: {
          escalation_id: ESCALATION_ID,
          investigation_id: 'inv-2',
          is_default_space: false,
          linked_investigation_count: 3,
        },
      },
      {
        eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationInvestigationLinked,
        payload: {
          escalation_id: ESCALATION_ID,
          investigation_id: 'inv-3',
          is_default_space: false,
          linked_investigation_count: 3,
        },
      },
    ]);
  });

  it('reports nothing for ids that were already linked', () => {
    expect(
      buildEscalationInvestigationLinkedEvents({
        ...params,
        nextIds: ['inv-1'],
        previousIds: ['inv-1'],
      })
    ).toEqual([]);
  });

  it('reports nothing when the write did not change the linked investigations', () => {
    expect(buildEscalationInvestigationLinkedEvents({ ...params, changedFields: [] })).toEqual([]);
  });
});
