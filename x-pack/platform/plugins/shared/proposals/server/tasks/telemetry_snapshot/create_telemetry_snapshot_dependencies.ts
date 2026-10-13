/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/server';
import { PROPOSALS_INDEX_NAME } from '@kbn/proposals-common';
import type { TelemetryPluginStart } from '@kbn/telemetry-plugin/server';
import type { ProposalsSnapshotAggregations, TelemetrySnapshotDependencies } from './types';

/** Builds a snapshot run's dependencies from the plugin's start services. */
export const createTelemetrySnapshotDependencies = ({
  core,
  telemetry,
}: {
  core: Pick<CoreStart, 'analytics' | 'elasticsearch'>;
  telemetry?: Pick<TelemetryPluginStart, 'isOptedIn$'>;
}): TelemetrySnapshotDependencies => ({
  analytics: core.analytics,
  isOptedIn$: telemetry?.isOptedIn$,
  // One raw search rather than the storage client's, whose reads first check the index mappings
  // with calls that cannot carry the run's abort signal. Proposals from every space are summed,
  // so the search runs as the internal user.
  searchSnapshot: async (request, { signal }) => {
    const { aggregations } = await core.elasticsearch.client.asInternalUser.search<
      unknown,
      ProposalsSnapshotAggregations
    >(
      {
        ...request,
        // No proposal has been written yet: an empty snapshot rather than an error.
        allow_no_indices: true,
        ignore_unavailable: true,
        index: PROPOSALS_INDEX_NAME,
      },
      { signal }
    );
    return { aggregations };
  },
});
