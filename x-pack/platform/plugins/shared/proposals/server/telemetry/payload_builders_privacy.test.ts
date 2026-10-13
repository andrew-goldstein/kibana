/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDocument } from '../storage/proposals_storage';
import { buildCreatedPayload } from './build_created_payload';
import { buildResumeRejectedPayload } from './build_resume_rejected_payload';
import { buildRetriedPayload } from './build_retried_payload';
import { buildRevisedPayload } from './build_revised_payload';
import { buildUpdateEvents } from './build_update_events';
import { toTelemetryRecord } from './to_telemetry_record';
import type { ProposalTelemetryRecord, ProposalWriteContext } from './types';

/** Caller free text a payload builder must never read, however the stored record carries it. */
const NEVER_READ_FIELDS = ['previousExecutionError', 'title'] as const;

type NeverReadField = (typeof NEVER_READ_FIELDS)[number];

/**
 * Fails type_check the moment either field joins the record the builders are typed against,
 * which is the first thing reading one would need.
 */
const recordOmitsNeverReadFields: [Extract<keyof ProposalTelemetryRecord, NeverReadField>] extends [
  never
]
  ? true
  : false = true;

/** Free text the fixture stores, none of which may appear in any payload. */
const SECRETS = {
  actionInput: 'secret-action-input',
  comment: 'secret-comment',
  executionError: 'secret-execution-error',
  previousExecutionError: 'secret-previous-execution-error',
  rationale: 'secret-rationale',
  title: 'secret-title',
};

/** A whole stored document, as the service hands it over: text fields and all. */
const storedRecord = (
  overrides: Partial<ProposalDocument & { id: string }> = {}
): ProposalDocument & { id: string } => ({
  actionInput: { host: SECRETS.actionInput },
  actionWorkflowId: 'action-workflow-1',
  category: 'respond',
  comment: SECRETS.comment,
  confidence: 'high',
  conversationId: 'conv-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  executionError: SECRETS.executionError,
  expiresAt: '2026-09-04T00:00:00.000Z',
  id: 'proposal-2',
  impact: 'medium',
  origin: 'alertzero',
  previousExecutionError: SECRETS.previousExecutionError,
  provenance: {
    actionId: 'security-isolate-host',
    attempt: 2,
    callerManaged: true,
    callerRunId: 'exec-root',
  },
  rationale: SECRETS.rationale,
  ranks: { confidence: 3, impact: 2 },
  revision: 1,
  rootProposalId: 'proposal-1',
  spaceId: 'space-a',
  status: 'pending',
  title: SECRETS.title,
  ...overrides,
});

/** Wraps a record so every property read on it is recorded. */
const tracked = <T extends object>(record: T, reads: Set<PropertyKey>): T =>
  new Proxy(record, {
    get: (target, property, receiver) => {
      reads.add(property);
      return Reflect.get(target, property, receiver);
    },
  });

/** A tracked stored record, turned into the builders' record the way the service does it. */
const asTelemetryRecord = (
  stored: ProposalDocument & { id: string },
  reads: Set<PropertyKey>,
  context?: ProposalWriteContext
): ProposalTelemetryRecord => toTelemetryRecord(tracked(stored, reads), context);

/** Every payload builder, fed tracked stored records, with what each produced. */
const runEveryBuilder = (reads: Set<PropertyKey>): unknown[] => {
  const pending = asTelemetryRecord(storedRecord(), reads, { autoApproveRequested: false });
  const executing = asTelemetryRecord(
    storedRecord({
      decidedAt: '2026-09-02T00:00:00.000Z',
      decision: 'approved',
      status: 'executing',
    }),
    reads,
    { decisionSource: 'human' }
  );
  const failed = asTelemetryRecord(
    storedRecord({
      decidedAt: '2026-09-02T00:00:00.000Z',
      decision: 'approved',
      status: 'failed',
    }),
    reads
  );
  const revision = asTelemetryRecord(
    storedRecord({ comment: 'another secret', id: 'proposal-3', revision: 2 }),
    reads
  );
  const now = Date.parse('2026-09-02T00:05:00.000Z');

  return [
    buildCreatedPayload(pending),
    // Decided and status_changed from one write, then action_executed from the next.
    buildUpdateEvents({ after: executing, before: pending, now }),
    buildUpdateEvents({ after: failed, before: executing, now }),
    buildRetriedPayload(pending),
    buildRevisedPayload({ original: pending, revision }),
    buildResumeRejectedPayload(pending, 'settled'),
  ];
};

describe('proposals payload builders', () => {
  it('are typed against a record that has neither the title nor the previous error', () => {
    expect(recordOmitsNeverReadFields).toBe(true);
  });

  it('run every event type the service reports per proposal', () => {
    const payloads = runEveryBuilder(new Set());

    expect(JSON.stringify(payloads)).toContain('proposal-2');
  });

  it.each(NEVER_READ_FIELDS.map((field) => [field]))(
    'never read %s from a stored proposal',
    (field) => {
      const reads = new Set<PropertyKey>();

      runEveryBuilder(reads);

      expect(reads.has(field)).toBe(false);
    }
  );

  it.each(Object.entries(SECRETS))('never ship the stored %s', (_field, secret) => {
    expect(JSON.stringify(runEveryBuilder(new Set()))).not.toContain(secret);
  });
});
