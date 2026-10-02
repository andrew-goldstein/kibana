/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSnapshotSearchRequest } from './build_snapshot_search_request';

const NOW = new Date('2026-09-28T12:00:00.000Z');

describe('buildSnapshotSearchRequest', () => {
  it('fetches no documents, only aggregations', () => {
    const { size, track_total_hits: trackTotalHits } = buildSnapshotSearchRequest(NOW);

    expect({ size, trackTotalHits }).toEqual({ size: 0, trackTotalHits: false });
  });

  it('counts chain heads only, leaving out every proposal a retry or revision replaced', () => {
    expect(buildSnapshotSearchRequest(NOW).query).toEqual({
      bool: {
        must_not: [{ exists: { field: 'supersededBy' } }, { term: { status: 'superseded' } }],
      },
    });
  });

  it('ages pending proposals from the chain root creation', () => {
    const { aggs } = buildSnapshotSearchRequest(NOW);

    expect({
      field: aggs.pending.aggs.by_age.date_range.field,
      filter: aggs.pending.filter,
    }).toEqual({ field: 'createdAt', filter: { term: { status: 'pending' } } });
  });

  it('counts a pending proposal as overdue from its deadline onwards', () => {
    const { overdue } = buildSnapshotSearchRequest(NOW).aggs.pending.aggs;

    expect({ field: overdue.aggs.by_age.date_range.field, filter: overdue.filter }).toEqual({
      field: 'expiresAt',
      filter: { range: { expiresAt: { lte: NOW.toISOString() } } },
    });
  });

  it('ages executing proposals from the approval', () => {
    const { executing } = buildSnapshotSearchRequest(NOW).aggs;

    expect({ field: executing.aggs.by_age.date_range.field, filter: executing.filter }).toEqual({
      field: 'decidedAt',
      filter: { term: { status: 'executing' } },
    });
  });

  it('groups settled proposals by status, bounded to the settled statuses', () => {
    expect(buildSnapshotSearchRequest(NOW).aggs.settled.terms).toEqual({
      field: 'status',
      include: ['succeeded', 'failed', 'expired', 'no_action'],
      size: 4,
    });
  });

  it('splits each settled status by its recorded settle path, including none', () => {
    const { aggs } = buildSnapshotSearchRequest(NOW).aggs.settled;

    expect(aggs).toEqual({
      by_settled_by: { terms: { field: 'provenance.settledBy', size: 10 } },
      no_settled_by: {
        aggs: { no_provenance: { missing: { field: 'provenance.attempt' } } },
        missing: { field: 'provenance.settledBy' },
      },
    });
  });

  it('counts spaces with a bounded cardinality aggregation', () => {
    expect(buildSnapshotSearchRequest(NOW).aggs.space_count).toEqual({
      cardinality: { field: 'spaceId', precision_threshold: 3000 },
    });
  });
});
