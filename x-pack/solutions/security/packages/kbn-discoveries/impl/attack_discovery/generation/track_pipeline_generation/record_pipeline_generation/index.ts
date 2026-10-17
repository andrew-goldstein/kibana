/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  extractGenerationWorkflowResult,
  writeGenerateStepStartedEvent,
  writeGenerateStepSucceededEvent,
  writeGenerationSucceededEvent,
} from '../../invoke_generation_workflow';
import { buildWorkflowExecutions } from '../build_workflow_executions';
import { getPipelinePhaseRuns } from '../get_pipeline_phase_runs';
import { getRunTimes } from '../get_run_times';
import type { PipelineGenerationContext } from '../types';

/**
 * Writes the generation phase's events once its child run has ended: generate-step started and
 * succeeded, then generation-succeeded, in the same order as the orchestrator.
 */
export const recordPipelineGeneration = async (
  context: PipelineGenerationContext
): Promise<void> => {
  const {
    apiConfig,
    authenticatedUser,
    eventLogIndex,
    eventLogger,
    executionUuid,
    logger,
    spaceId,
  } = context;
  const runs = await getPipelinePhaseRuns({
    ...context,
    loadPhase: (phase) => phase === 'generation',
  });
  const execution = runs.generation?.execution;

  if (runs.generation == null || execution == null) {
    logger.warn(`No generation run found for pipeline generation ${executionUuid}`);
    return;
  }

  const { tracking } = runs.generation;
  const { alertsContextCount } = extractGenerationWorkflowResult({ execution, executionUuid });
  const { endTime, startTime } = getRunTimes(execution);
  const event = {
    alertsContextCount,
    authenticatedUser,
    connectorId: apiConfig.connector_id,
    eventLogger,
    eventLogIndex,
    executionUuid,
    logger,
    spaceId,
    startTime,
    workflowExecutions: buildWorkflowExecutions(runs),
    workflowId: tracking.workflowId,
    workflowRunId: tracking.workflowRunId,
  };

  await writeGenerateStepStartedEvent(event);
  await writeGenerateStepSucceededEvent({ ...event, endTime });
  await writeGenerationSucceededEvent({ ...event, endTime });
};
