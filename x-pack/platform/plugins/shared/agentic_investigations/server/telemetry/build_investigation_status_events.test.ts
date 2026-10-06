/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from './constants';
import type { BuildInvestigationStatusEventsParams } from './build_investigation_status_events';
import { buildInvestigationStatusEvents } from './build_investigation_status_events';

const INVESTIGATION_ID = '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f';
const WORKFLOW_EXECUTION_ID = '3f2c9e1a-7b4d-4c8e-9a1f-2d3e4f5a6b7c';
const NOW = Date.parse('2026-09-28T12:00:00.000Z');

const closeParams: BuildInvestigationStatusEventsParams = {
  changedFields: ['status'],
  closedBy: 'direct',
  createdAt: '2026-09-28T11:00:00.000Z',
  dismissReason: undefined,
  dismissedProposalCount: 0,
  investigationId: INVESTIGATION_ID,
  isDefaultSpace: true,
  nextStatus: 'closed',
  now: NOW,
  pendingProposalCount: 0,
  previousStatus: 'open',
  reopenedBy: 'direct',
  workflowExecutionId: undefined,
};

const reopenParams: BuildInvestigationStatusEventsParams = {
  ...closeParams,
  nextStatus: 'open',
  previousStatus: 'closed',
};

describe('buildInvestigationStatusEvents', () => {
  describe('no-op writes', () => {
    it('returns no event when the write changed nothing', () => {
      expect(buildInvestigationStatusEvents({ ...closeParams, changedFields: [] })).toEqual([]);
    });

    it('returns no event when the write changed only other fields', () => {
      expect(
        buildInvestigationStatusEvents({ ...closeParams, changedFields: ['severity'] })
      ).toEqual([]);
    });
  });

  describe('open', () => {
    it.each(['direct', 'workflow_step', 'workflow_request'] as const)(
      'reports a %s reopen when the investigation was closed',
      (reopenedBy) => {
        expect(buildInvestigationStatusEvents({ ...reopenParams, reopenedBy })).toEqual([
          {
            eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened,
            payload: {
              investigation_id: INVESTIGATION_ID,
              is_default_space: true,
              reopened_by_class: reopenedBy,
            },
          },
        ]);
      }
    );

    it.each(['workflow_step', 'workflow_request'] as const)(
      'ships the workflow run id on a %s reopen',
      (reopenedBy) => {
        const [event] = buildInvestigationStatusEvents({
          ...reopenParams,
          reopenedBy,
          workflowExecutionId: WORKFLOW_EXECUTION_ID,
        });

        expect(event.payload).toEqual(
          expect.objectContaining({ workflow_execution_id: WORKFLOW_EXECUTION_ID })
        );
      }
    );

    it('omits the workflow run id on a direct reopen, even when one is passed', () => {
      const [event] = buildInvestigationStatusEvents({
        ...reopenParams,
        reopenedBy: 'direct',
        workflowExecutionId: WORKFLOW_EXECUTION_ID,
      });

      expect(event.payload).not.toHaveProperty('workflow_execution_id');
    });

    it('returns no event when the investigation had no status', () => {
      expect(
        buildInvestigationStatusEvents({
          ...closeParams,
          isDefaultSpace: false,
          nextStatus: 'open',
          previousStatus: undefined,
        })
      ).toEqual([]);
    });

    it('reports reopened when a stale read said open but the write changed the status', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        nextStatus: 'open',
        previousStatus: 'open',
      });

      expect(event.eventType).toBe(AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened);
    });
  });

  describe('close', () => {
    it('reports closed with the actor class, time open and proposal counts', () => {
      expect(buildInvestigationStatusEvents({ ...closeParams, pendingProposalCount: 0 })).toEqual([
        {
          eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed,
          payload: {
            closed_by_class: 'direct',
            investigation_id: INVESTIGATION_ID,
            is_default_space: true,
            proposals_dismissed_at_close: 0,
            proposals_open_at_close: 0,
            time_open_ms: 3_600_000,
          },
        },
      ]);
    });

    it('classes a cascade close as escalation_cascade', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        closedBy: 'escalation_cascade',
      });

      expect(event.payload).toEqual(
        expect.objectContaining({ closed_by_class: 'escalation_cascade' })
      );
    });

    it('ships the workflow run id on a workflow_request close', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        closedBy: 'workflow_request',
        workflowExecutionId: WORKFLOW_EXECUTION_ID,
      });

      expect(event.payload).toEqual(
        expect.objectContaining({
          closed_by_class: 'workflow_request',
          workflow_execution_id: WORKFLOW_EXECUTION_ID,
        })
      );
    });

    it('labels a workflow_request close without a run id when none is known', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        closedBy: 'workflow_request',
      });

      expect(event.payload).not.toHaveProperty('workflow_execution_id');
    });

    it.each(['direct', 'escalation_cascade'] as const)(
      'omits the workflow run id on a %s close, even when one is passed',
      (closedBy) => {
        const [event] = buildInvestigationStatusEvents({
          ...closeParams,
          closedBy,
          workflowExecutionId: WORKFLOW_EXECUTION_ID,
        });

        expect(event.payload).not.toHaveProperty('workflow_execution_id');
      }
    );

    it('reports closed when the investigation had no status', () => {
      const [event] = buildInvestigationStatusEvents({ ...closeParams, previousStatus: undefined });

      expect(event.eventType).toBe(AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed);
    });

    it('ships the dismiss reason and both counts when the close dismissed pending proposals', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        dismissReason: 'risk_accepted',
        dismissedProposalCount: 3,
        pendingProposalCount: 3,
      });

      expect(event.payload).toEqual(
        expect.objectContaining({
          dismiss_reason: 'risk_accepted',
          proposals_dismissed_at_close: 3,
          proposals_open_at_close: 3,
        })
      );
    });

    it('omits the dismiss reason when no proposal was pending', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        dismissReason: 'risk_accepted',
        pendingProposalCount: 0,
      });

      expect(event.payload).not.toHaveProperty('dismiss_reason');
    });

    it('reports skipped proposals as open but not dismissed, without a dismiss reason', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        dismissReason: 'risk_accepted',
        dismissedProposalCount: 0,
        pendingProposalCount: 2,
      });

      expect(event.payload).toEqual({
        closed_by_class: 'direct',
        investigation_id: INVESTIGATION_ID,
        is_default_space: true,
        proposals_dismissed_at_close: 0,
        proposals_open_at_close: 2,
        time_open_ms: 3_600_000,
      });
    });

    it('omits time_open_ms when the creation time cannot be read', () => {
      const [event] = buildInvestigationStatusEvents({ ...closeParams, createdAt: undefined });

      expect(event.payload).not.toHaveProperty('time_open_ms');
    });
  });
});
