/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildInvestigationClosedPayload,
  buildInvestigationCreatedPayload,
  buildInvestigationReopenedPayload,
} from './build_investigation_payloads';

const WORKER = {
  actorClass: 'worker',
  workerId: 'system-security-floor-attack-discovery',
} as const;
const USER = { actorClass: 'user' } as const;

describe('buildInvestigationCreatedPayload', () => {
  it('builds the payload with an allowlisted severity and the worker id', () => {
    expect(
      buildInvestigationCreatedPayload({
        actor: WORKER,
        event: {
          changes: { severity: { next: 'high' }, status: { next: 'open' } },
          conversationId: 'conv-1',
          spaceId: 'default',
        },
      })
    ).toEqual({
      created_by_class: 'worker',
      investigation_id: 'conv-1',
      is_default_space: true,
      severity: 'high',
      worker_id: 'system-security-floor-attack-discovery',
    });
  });

  it('omits a severity outside the template options and the worker id for other classes', () => {
    expect(
      buildInvestigationCreatedPayload({
        actor: { ...USER, workerId: 'system-security-floor-attack-discovery' },
        event: {
          changes: { severity: { next: 'urgent' } },
          conversationId: 'conv-1',
          spaceId: 'team-a',
        },
      })
    ).toEqual({
      created_by_class: 'user',
      investigation_id: 'conv-1',
      is_default_space: false,
    });
  });
});

describe('buildInvestigationClosedPayload', () => {
  it('builds the payload with the close reason and severity the write set', () => {
    expect(
      buildInvestigationClosedPayload({
        actor: WORKER,
        event: {
          changes: {
            close_reason: { next: 'false_positive' },
            severity: { next: 'low', previous: 'high' },
            status: { next: 'closed', previous: 'open' },
          },
          conversationId: 'conv-1',
          spaceId: 'default',
        },
      })
    ).toEqual({
      close_reason: 'false_positive',
      closed_by_class: 'worker',
      investigation_id: 'conv-1',
      is_default_space: true,
      severity: 'low',
      worker_id: 'system-security-floor-attack-discovery',
    });
  });

  it('omits values outside the template options and fields the write did not set', () => {
    expect(
      buildInvestigationClosedPayload({
        actor: USER,
        event: {
          changes: {
            close_reason: { next: 'bored' },
            status: { next: 'closed', previous: 'open' },
          },
          conversationId: 'conv-1',
          spaceId: 'team-a',
        },
      })
    ).toEqual({
      closed_by_class: 'user',
      investigation_id: 'conv-1',
      is_default_space: false,
    });
  });
});

describe('buildInvestigationReopenedPayload', () => {
  it('builds the payload with the worker id', () => {
    expect(
      buildInvestigationReopenedPayload({
        actor: WORKER,
        event: {
          changes: { status: { next: 'open', previous: 'closed' } },
          conversationId: 'conv-1',
          spaceId: 'default',
        },
      })
    ).toEqual({
      investigation_id: 'conv-1',
      is_default_space: true,
      reopened_by_class: 'worker',
      worker_id: 'system-security-floor-attack-discovery',
    });
  });

  it('builds the payload without a worker id for other classes', () => {
    expect(
      buildInvestigationReopenedPayload({
        actor: { actorClass: 'agent' },
        event: {
          changes: { status: { next: 'open', previous: 'closed' } },
          conversationId: 'conv-1',
          spaceId: 'team-a',
        },
      })
    ).toEqual({
      investigation_id: 'conv-1',
      is_default_space: false,
      reopened_by_class: 'agent',
    });
  });
});
