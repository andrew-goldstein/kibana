/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowExecutionDto } from '@kbn/workflows';

/** Returns when a child run started and ended; a run that hasn't ended yet ends now. */
export const getRunTimes = (
  execution: Pick<WorkflowExecutionDto, 'finishedAt' | 'startedAt'>
): { endTime: Date; startTime: Date } => ({
  endTime: execution.finishedAt ? new Date(execution.finishedAt) : new Date(),
  startTime: new Date(execution.startedAt),
});
