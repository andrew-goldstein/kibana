/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalStatus } from '@kbn/proposals-common';
import type { ProposalsSnapshotSearchRequest } from './build_snapshot_search_request';
import type { ProposalsSnapshotAggregations, SnapshotTermsBucket } from './types';

/** The stored fields the snapshot reads, as they sit in `_source`. */
export interface SnapshotFixtureDocument {
  createdAt: string;
  decidedAt?: string;
  expiresAt?: string;
  settledBy?: string;
  spaceId: string;
  status: ProposalStatus;
  supersededBy?: string;
}

/** The query clauses the snapshot search uses; anything else fails the evaluator. */
interface FixtureQuery {
  bool?: { filter?: FixtureQuery[]; must?: FixtureQuery[]; must_not?: FixtureQuery[] };
  exists?: { field: string };
  range?: Record<string, { gt?: string; gte?: string; lt?: string; lte?: string }>;
  term?: Record<string, string>;
}

const readField = (document: SnapshotFixtureDocument, field: string): string | undefined =>
  Object.entries(document).find(([key]) => key === field)?.[1];

const matchesBool = (
  document: SnapshotFixtureDocument,
  {
    filter = [],
    must = [],
    must_not: mustNot = [],
    ...unsupported
  }: NonNullable<FixtureQuery['bool']>
): boolean => {
  if (Object.keys(unsupported).length > 0) {
    throw new Error(
      `the fixture evaluator does not support bool.${Object.keys(unsupported).join(', bool.')}`
    );
  }
  return (
    [...filter, ...must].every((query) => matchesQuery(document, query)) &&
    !mustNot.some((query) => matchesQuery(document, query))
  );
};

const matchesTerm = (
  document: SnapshotFixtureDocument,
  term: NonNullable<FixtureQuery['term']>
): boolean =>
  Object.entries(term).every(([field, expected]) => readField(document, field) === expected);

const matchesRange = (
  document: SnapshotFixtureDocument,
  range: NonNullable<FixtureQuery['range']>
): boolean =>
  Object.entries(range).every(([field, { gt, gte, lt, lte }]) => {
    const value = readField(document, field);
    if (value === undefined) {
      return false;
    }
    const timestampMs = Date.parse(value);
    return (
      (gt === undefined || timestampMs > Date.parse(gt)) &&
      (gte === undefined || timestampMs >= Date.parse(gte)) &&
      (lt === undefined || timestampMs < Date.parse(lt)) &&
      (lte === undefined || timestampMs <= Date.parse(lte))
    );
  });

/** Evaluates the query clauses the snapshot uses against one document, like Elasticsearch. */
const matchesQuery = (document: SnapshotFixtureDocument, query: FixtureQuery): boolean => {
  const { bool, exists, range, term, ...unsupported } = query;
  if (Object.keys(unsupported).length > 0) {
    throw new Error(
      `the fixture evaluator does not support ${Object.keys(unsupported).join(', ')}`
    );
  }
  return (
    (bool === undefined || matchesBool(document, bool)) &&
    (exists === undefined || readField(document, exists.field) !== undefined) &&
    (term === undefined || matchesTerm(document, term)) &&
    (range === undefined || matchesRange(document, range))
  );
};

/** `date_range` semantics: every declared range is returned, `from` inclusive, `to` exclusive. */
const countDateRanges = (
  documents: SnapshotFixtureDocument[],
  {
    field,
    ranges,
  }: ProposalsSnapshotSearchRequest['aggs']['executing']['aggs']['by_age']['date_range']
) => ({
  buckets: ranges.map(({ from, key, to }) => ({
    doc_count: documents.filter((document) => {
      const value = readField(document, field);
      if (value === undefined) {
        return false;
      }
      const timestampMs = Date.parse(value);
      return (
        (from === undefined || timestampMs >= Date.parse(from)) &&
        (to === undefined || timestampMs < Date.parse(to))
      );
    }).length,
    key,
  })),
});

/** `terms` semantics: documents missing the field are left out, largest buckets first. */
const groupTerms = (
  documents: SnapshotFixtureDocument[],
  { field, include, size }: { field: string; include?: string[]; size: number }
): Array<SnapshotTermsBucket & { documents: SnapshotFixtureDocument[] }> => {
  const values = [
    ...new Set(
      documents.flatMap((document) => {
        const value = readField(document, field);
        return value === undefined || (include !== undefined && !include.includes(value))
          ? []
          : [value];
      })
    ),
  ];
  return values
    .map((key) => {
      const matching = documents.filter((document) => readField(document, field) === key);
      return { doc_count: matching.length, documents: matching, key };
    })
    .sort((a, b) => b.doc_count - a.doc_count || a.key.localeCompare(b.key))
    .slice(0, size);
};

/**
 * Runs the snapshot search over fixture documents the way Elasticsearch would, reading every
 * filter, field, range and size from the request itself. It throws on a query clause it does not
 * model, so a request change cannot silently pass.
 */
export const evaluateSnapshotSearch = (
  request: ProposalsSnapshotSearchRequest,
  documents: SnapshotFixtureDocument[]
): ProposalsSnapshotAggregations => {
  const heads = documents.filter((document) => matchesQuery(document, request.query));
  const { executing, pending, settled, space_count: spaceCount } = request.aggs;
  const pendingHeads = heads.filter((document) => matchesQuery(document, pending.filter));
  const overdueHeads = pendingHeads.filter((document) =>
    matchesQuery(document, pending.aggs.overdue.filter)
  );
  const executingHeads = heads.filter((document) => matchesQuery(document, executing.filter));

  return {
    executing: { by_age: countDateRanges(executingHeads, executing.aggs.by_age.date_range) },
    pending: {
      by_age: countDateRanges(pendingHeads, pending.aggs.by_age.date_range),
      overdue: {
        by_age: countDateRanges(overdueHeads, pending.aggs.overdue.aggs.by_age.date_range),
      },
    },
    settled: {
      buckets: groupTerms(heads, settled.terms).map(
        ({ doc_count: docCount, documents: inStatus, key }) => ({
          by_settled_by: {
            buckets: groupTerms(inStatus, settled.aggs.by_settled_by.terms).map(
              ({ doc_count: count, key: settledBy }) => ({ doc_count: count, key: settledBy })
            ),
          },
          doc_count: docCount,
          key,
          no_settled_by: {
            doc_count: inStatus.filter(
              (document) =>
                readField(document, settled.aggs.no_settled_by.missing.field) === undefined
            ).length,
          },
        })
      ),
    },
    space_count: {
      value: new Set(heads.map((document) => readField(document, spaceCount.cardinality.field)))
        .size,
    },
  };
};
