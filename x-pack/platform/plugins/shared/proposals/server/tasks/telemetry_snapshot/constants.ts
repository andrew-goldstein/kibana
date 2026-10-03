/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const TELEMETRY_SNAPSHOT_TASK_TYPE = 'proposals:telemetry_snapshot';

/** Stable, so `ensureScheduled` keeps one task instance across restarts and Kibana nodes. */
export const TELEMETRY_SNAPSHOT_TASK_ID = `${TELEMETRY_SNAPSHOT_TASK_TYPE}:1.0.0`;

export const TELEMETRY_SNAPSHOT_INTERVAL = '24h';

export const TELEMETRY_SNAPSHOT_TIMEOUT = '5m';

/** How long a run waits for the telemetry plugin's opt-in decision before treating it as out. */
export const TELEMETRY_OPT_IN_TIMEOUT_MS = 5_000;

/**
 * The `space_count` cardinality is near-exact below this many spaces, far above the 1000 spaces a
 * deployment allows by default, at a fixed memory cost.
 */
export const SPACE_COUNT_PRECISION_THRESHOLD = 3_000;

/**
 * Buckets per settled status for its settle path. The stored vocabulary has three values, so the
 * headroom only matters if a later version writes a new one.
 */
export const SETTLED_BY_TERMS_SIZE = 10;
