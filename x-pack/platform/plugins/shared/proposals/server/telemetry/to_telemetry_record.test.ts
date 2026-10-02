/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDocument } from '../storage/proposals_storage';
import { toTelemetryRecord } from './to_telemetry_record';

const storedRecord = (
  overrides: Partial<ProposalDocument & { id: string }> = {}
): ProposalDocument & { id: string } => ({
  actionWorkflowId: 'action-workflow-1',
  comment: 'comment',
  confidence: 'high',
  conversationId: 'conv-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  id: 'proposal-2',
  impact: 'medium',
  origin: 'alertzero',
  previousExecutionError: 'previous error',
  provenance: {
    actionId: 'security-isolate-host',
    attempt: 2,
    callerManaged: true,
    callerRunId: 'exec-root',
    settledBy: 'deadline',
  },
  ranks: { confidence: 0, impact: 2 },
  revision: 1,
  rootProposalId: 'proposal-1',
  spaceId: 'space-a',
  status: 'expired',
  title: 'title',
  ...overrides,
});

describe('toTelemetryRecord', () => {
  it('flattens the stored provenance', () => {
    expect(toTelemetryRecord(storedRecord())).toEqual(
      expect.objectContaining({
        actionId: 'security-isolate-host',
        attempt: 2,
        callerManaged: true,
        callerRunId: 'exec-root',
        settledBy: 'deadline',
      })
    );
  });

  it('adds what only the write in progress knows', () => {
    expect(
      toTelemetryRecord(storedRecord(), { autoApproveRequested: true, decisionSource: 'autonomy' })
    ).toEqual(expect.objectContaining({ autoApproveRequested: true, decisionSource: 'autonomy' }));
  });

  it('reads a record written without provenance as having none', () => {
    const record = toTelemetryRecord(storedRecord({ provenance: undefined }));

    expect(record).toEqual(expect.objectContaining({ id: 'proposal-2', status: 'expired' }));
    expect(record.callerRunId).toBeUndefined();
  });

  it('leaves out the caller free text and the storage-only keys', () => {
    const record = toTelemetryRecord(storedRecord());

    expect(Object.keys(record)).toEqual(
      expect.not.arrayContaining(['previousExecutionError', 'provenance', 'ranks', 'title'])
    );
  });
});
