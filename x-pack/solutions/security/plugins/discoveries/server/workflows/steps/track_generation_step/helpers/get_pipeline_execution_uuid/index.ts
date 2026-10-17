/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v5 as uuidv5 } from 'uuid';

/** Changing this changes every generation id, so in-flight generations could not finish. */
const PIPELINE_GENERATION_NAMESPACE = '8a10a245-5882-4a84-8a8d-ee50ec7aa6ec';

/**
 * Returns the id of the generation a workflow run tracks, derived from the run's id so a run can
 * only record its own generation.
 */
export const getPipelineExecutionUuid = (runId: string): string =>
  uuidv5(runId, PIPELINE_GENERATION_NAMESPACE);
