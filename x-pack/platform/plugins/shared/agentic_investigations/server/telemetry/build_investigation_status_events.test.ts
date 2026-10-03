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
const NOW = Date.parse('2026-09-28T12:00:00.000Z');

const closeParams: BuildInvestigationStatusEventsParams = {
  changedFields: ['status'],
  closedBy: 'direct',
  createdAt: '2026-09-28T11:00:00.000Z',
  dismissReason: undefined,
  dismissedProposalCount: 0,
  investigationId: INVESTIGATION_ID,
  isDefaultSpace: true,
  metadata: { status: 'closed' },
  nextStatus: 'closed',
  now: NOW,
  pendingProposalCount: 0,
  previousStatus: 'open',
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
    it('reports reopened when the investigation was closed', () => {
      expect(
        buildInvestigationStatusEvents({
          ...closeParams,
          metadata: { status: 'open' },
          nextStatus: 'open',
          previousStatus: 'closed',
        })
      ).toEqual([
        {
          eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened,
          payload: { investigation_id: INVESTIGATION_ID, is_default_space: true },
        },
      ]);
    });

    it('returns no event when the investigation had no status', () => {
      expect(
        buildInvestigationStatusEvents({
          ...closeParams,
          isDefaultSpace: false,
          metadata: { status: 'open' },
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
    it('reports closed with the actor class, time open and proposal count', () => {
      expect(buildInvestigationStatusEvents({ ...closeParams, pendingProposalCount: 0 })).toEqual([
        {
          eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed,
          payload: {
            closed_by_class: 'direct',
            investigation_id: INVESTIGATION_ID,
            is_default_space: true,
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

    it('reports closed when the investigation had no status', () => {
      const [event] = buildInvestigationStatusEvents({ ...closeParams, previousStatus: undefined });

      expect(event.eventType).toBe(AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed);
    });

    it('ships the template close reason when it is in the SELECT vocabulary', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        metadata: { close_reason: 'benign', status: 'closed' },
      });

      expect(event.payload).toEqual(expect.objectContaining({ close_reason: 'benign' }));
    });

    it('omits a close reason outside the SELECT vocabulary', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        metadata: { close_reason: 'the user typed this', status: 'closed' },
      });

      expect(event.payload).not.toHaveProperty('close_reason');
    });

    it('omits the close reason when the metadata is missing', () => {
      const [event] = buildInvestigationStatusEvents({ ...closeParams, metadata: undefined });

      expect(event.payload).not.toHaveProperty('close_reason');
    });

    it('ships the dismiss reason when the close dismissed pending proposals', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        dismissReason: 'risk_accepted',
        dismissedProposalCount: 3,
        pendingProposalCount: 3,
      });

      expect(event.payload).toEqual(
        expect.objectContaining({ dismiss_reason: 'risk_accepted', proposals_open_at_close: 3 })
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

    it('omits the dismiss reason when every pending proposal was skipped, not dismissed', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        dismissReason: 'risk_accepted',
        dismissedProposalCount: 0,
        pendingProposalCount: 2,
      });

      expect(event.payload).not.toHaveProperty('dismiss_reason');
      expect(event.payload).toEqual(expect.objectContaining({ proposals_open_at_close: 2 }));
    });

    it('omits time_open_ms when the creation time cannot be read', () => {
      const [event] = buildInvestigationStatusEvents({ ...closeParams, createdAt: undefined });

      expect(event.payload).not.toHaveProperty('time_open_ms');
    });

    it('never ships free-text metadata such as the verdict or summary', () => {
      const [event] = buildInvestigationStatusEvents({
        ...closeParams,
        metadata: { status: 'closed', summary: 'secret summary', verdict: 'secret verdict' },
      });

      expect(JSON.stringify(event.payload)).not.toMatch(/secret/);
    });
  });
});
