/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import { coreMock, elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { PROPOSALS_INDEX_NAME } from '@kbn/proposals-common';
import type { TelemetryPluginStart } from '@kbn/telemetry-plugin/server';
import { buildSnapshotSearchRequest } from './build_snapshot_search_request';
import { createTelemetrySnapshotDependencies } from './create_telemetry_snapshot_dependencies';

const NOW = new Date('2026-09-28T12:00:00.000Z');

const setup = ({ withTelemetry = true }: { withTelemetry?: boolean } = {}) => {
  const core = {
    analytics: coreMock.createStart().analytics,
    elasticsearch: elasticsearchServiceMock.createStart(),
  };
  const isOptedIn$ = new BehaviorSubject(true);
  const telemetry: Pick<TelemetryPluginStart, 'isOptedIn$'> = { isOptedIn$ };
  const dependencies = createTelemetrySnapshotDependencies({
    core,
    telemetry: withTelemetry ? telemetry : undefined,
  });
  return { core, dependencies, esClient: core.elasticsearch.client.asInternalUser, isOptedIn$ };
};

describe('createTelemetrySnapshotDependencies', () => {
  it('reports through core analytics', () => {
    const { core, dependencies } = setup();

    expect(dependencies.analytics).toBe(core.analytics);
  });

  it('reads the opt-in from the telemetry plugin', () => {
    const { dependencies, isOptedIn$ } = setup();

    expect(dependencies.isOptedIn$).toBe(isOptedIn$);
  });

  it('has no opt-in stream without the telemetry plugin, which reads as opted out', () => {
    const { dependencies } = setup({ withTelemetry: false });

    expect(dependencies.isOptedIn$).toBeUndefined();
  });

  it('makes no Elasticsearch call until a search runs', () => {
    const { esClient } = setup();

    expect(esClient.search).not.toHaveBeenCalled();
  });

  it('searches the proposals index as the internal user with the run abort signal', async () => {
    const { dependencies, esClient } = setup();
    const { signal } = new AbortController();
    const request = buildSnapshotSearchRequest(NOW);

    await dependencies.searchSnapshot(request, { signal });

    expect(esClient.search).toHaveBeenCalledWith(
      {
        ...request,
        allow_no_indices: true,
        ignore_unavailable: true,
        index: PROPOSALS_INDEX_NAME,
      },
      { signal }
    );
  });

  it('returns the aggregations of the search response', async () => {
    const { dependencies, esClient } = setup();
    const aggregations = { space_count: { value: 2 } };
    esClient.search.mockResolvedValue({
      _shards: { failed: 0, successful: 1, total: 1 },
      aggregations,
      hits: { hits: [] },
      timed_out: false,
      took: 1,
    });

    const result = await dependencies.searchSnapshot(buildSnapshotSearchRequest(NOW), {
      signal: new AbortController().signal,
    });

    expect(result.aggregations).toBe(aggregations);
  });
});
