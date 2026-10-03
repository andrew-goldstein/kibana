/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSnapshotPayload } from './build_snapshot_payload';
import { buildSnapshotSearchRequest } from './build_snapshot_search_request';
import { evaluateSnapshotSearch, type SnapshotFixtureDocument } from './test_fixtures';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const SNAPSHOT_DAY = '2026-09-28';
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const inFuture = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const DOCUMENTS: SnapshotFixtureDocument[] = [
  // Pending: fresh with a future deadline, 2 days old and 2h overdue, 10 days old and 8 days
  // overdue, and 5h old with no deadline (never overdue).
  {
    createdAt: ago(30 * MINUTE_MS),
    expiresAt: inFuture(DAY_MS),
    spaceId: 'default',
    status: 'pending',
  },
  {
    createdAt: ago(2 * DAY_MS),
    expiresAt: ago(2 * HOUR_MS),
    spaceId: 'default',
    status: 'pending',
  },
  {
    createdAt: ago(10 * DAY_MS),
    expiresAt: ago(8 * DAY_MS),
    spaceId: 'space-a',
    status: 'pending',
  },
  { createdAt: ago(5 * HOUR_MS), spaceId: 'space-a', status: 'pending' },
  // Executing, by time since the approval.
  { createdAt: ago(DAY_MS), decidedAt: ago(3 * HOUR_MS), spaceId: 'default', status: 'executing' },
  {
    createdAt: ago(DAY_MS),
    decidedAt: ago(20 * MINUTE_MS),
    spaceId: 'space-b',
    status: 'executing',
  },
  // Settled heads.
  { createdAt: ago(DAY_MS), decidedAt: ago(HOUR_MS), spaceId: 'default', status: 'succeeded' },
  { createdAt: ago(DAY_MS), decidedAt: ago(HOUR_MS), spaceId: 'space-a', status: 'succeeded' },
  { createdAt: ago(DAY_MS), decidedAt: ago(HOUR_MS), spaceId: 'default', status: 'failed' },
  { createdAt: ago(DAY_MS), settledBy: 'workflow_failure', spaceId: 'default', status: 'failed' },
  { createdAt: ago(DAY_MS), settledBy: 'deadline', spaceId: 'default', status: 'failed' },
  { createdAt: ago(DAY_MS), settledBy: 'deadline', spaceId: 'default', status: 'expired' },
  { createdAt: ago(DAY_MS), settledBy: 'deadline', spaceId: 'space-a', status: 'expired' },
  { createdAt: ago(DAY_MS), settledBy: 'iteration_limit', spaceId: 'default', status: 'expired' },
  { createdAt: ago(DAY_MS), spaceId: 'default', status: 'expired' },
  { createdAt: ago(DAY_MS), decidedAt: ago(HOUR_MS), spaceId: 'default', status: 'no_action' },
  // Not chain heads: a revised predecessor and a failed original that was retried. Neither
  // counts, and space-c, which holds only these, is not a space with a proposal head.
  { createdAt: ago(DAY_MS), spaceId: 'space-c', status: 'superseded', supersededBy: 'revision' },
  { createdAt: ago(DAY_MS), spaceId: 'space-c', status: 'failed', supersededBy: 'clone' },
  { createdAt: ago(DAY_MS), spaceId: 'space-c', status: 'pending', supersededBy: 'lost-race' },
];

const snapshotOf = (documents: SnapshotFixtureDocument[]) =>
  buildSnapshotPayload({
    aggregations: evaluateSnapshotSearch(buildSnapshotSearchRequest(NOW), documents),
    snapshotDay: SNAPSHOT_DAY,
  });

describe('buildSnapshotPayload', () => {
  it('buckets pending chain heads by age', () => {
    expect(snapshotOf(DOCUMENTS).pending_by_age).toEqual([
      { age_bucket: 'le_1h', count: 1 },
      { age_bucket: 'le_24h', count: 1 },
      { age_bucket: 'le_72h', count: 1 },
      { age_bucket: 'gt_7d', count: 1 },
    ]);
  });

  it('buckets pending chain heads past their deadline by overdue time', () => {
    expect(snapshotOf(DOCUMENTS).pending_overdue_by_age).toEqual([
      { age_bucket: 'le_24h', count: 1 },
      { age_bucket: 'gt_7d', count: 1 },
    ]);
  });

  it('buckets executing chain heads by time since the approval', () => {
    expect(snapshotOf(DOCUMENTS).executing_by_age).toEqual([
      { age_bucket: 'le_1h', count: 1 },
      { age_bucket: 'le_24h', count: 1 },
    ]);
  });

  it('counts settled chain heads by status and reason', () => {
    expect(snapshotOf(DOCUMENTS).settled).toEqual([
      { count: 2, status: 'succeeded' },
      { count: 2, reason: 'workflow_failure', status: 'failed' },
      { count: 1, reason: 'action', status: 'failed' },
      { count: 1, status: 'expired' },
      { count: 2, reason: 'deadline', status: 'expired' },
      { count: 1, reason: 'iteration_limit', status: 'expired' },
      { count: 1, status: 'no_action' },
    ]);
  });

  it('counts the spaces that hold a chain head', () => {
    expect(snapshotOf(DOCUMENTS).space_count).toBe(3);
  });

  it('carries the snapshot day', () => {
    expect(snapshotOf(DOCUMENTS).snapshot_day).toBe(SNAPSHOT_DAY);
  });

  it('carries no ids and no per-space breakdown', () => {
    expect(Object.keys(snapshotOf(DOCUMENTS)).sort()).toEqual([
      'executing_by_age',
      'pending_by_age',
      'pending_overdue_by_age',
      'settled',
      'snapshot_day',
      'space_count',
    ]);
  });

  it('reports an empty snapshot when there are no proposals', () => {
    expect(snapshotOf([])).toEqual({
      executing_by_age: [],
      pending_by_age: [],
      pending_overdue_by_age: [],
      settled: [],
      snapshot_day: SNAPSHOT_DAY,
      space_count: 0,
    });
  });

  it('reports an empty snapshot when the index does not exist yet (no aggregations)', () => {
    expect(buildSnapshotPayload({ aggregations: undefined, snapshotDay: SNAPSHOT_DAY })).toEqual({
      executing_by_age: [],
      pending_by_age: [],
      pending_overdue_by_age: [],
      settled: [],
      snapshot_day: SNAPSHOT_DAY,
      space_count: 0,
    });
  });

  it('leaves out a settled status bucket outside the known vocabulary', () => {
    const aggregations = evaluateSnapshotSearch(buildSnapshotSearchRequest(NOW), []);

    const { settled } = buildSnapshotPayload({
      aggregations: {
        ...aggregations,
        settled: {
          buckets: [
            {
              by_settled_by: { buckets: [] },
              doc_count: 3,
              key: 'archived',
              no_settled_by: { doc_count: 3 },
            },
          ],
        },
      },
      snapshotDay: SNAPSHOT_DAY,
    });

    expect(settled).toEqual([]);
  });
});
