/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExecutionStatus } from '@kbn/workflows';

import { reportWorkflowError } from '../../../../lib/telemetry/report_workflow_telemetry';
import { writeGenerationFailedEvent } from '../../execute_generation_workflow';
import { writeGenerateStepFailedEvent } from '../../invoke_generation_workflow';
import { writeValidationFailedEvent } from '../../invoke_validation_workflow';
import { refreshEventLogIndex } from '../../refresh_event_log_index';
import { resolveDefaultWorkflowIds } from '../../resolve_default_workflow_ids';
import { writeAlertRetrievalFailedEvent } from '../../write_alert_retrieval_failed_event';
import { buildWorkflowExecutions } from '../build_workflow_executions';
import { classifyFailedRun, type FailedRunClassification } from '../classify_failed_run';
import { getPipelinePhaseRuns } from '../get_pipeline_phase_runs';
import { getRunTimes } from '../get_run_times';
import type { PipelineGenerationContext, PipelinePhaseRuns } from '../types';

const PHASES: ReadonlyArray<keyof PipelinePhaseRuns> = [
  'alertRetrieval',
  'generation',
  'validation',
];

const TELEMETRY_STEPS: Record<keyof PipelinePhaseRuns, string> = {
  alertRetrieval: 'retrieval',
  generation: 'generation',
  validation: 'validation',
};

/**
 * Writes the events for a pipeline run that failed: the failed phase's event (when a child run
 * failed) and generation-failed, then reports the `attack_discovery_error` telemetry event.
 */
export const recordPipelineFailure = async ({
  context,
  errorMessage,
}: {
  context: PipelineGenerationContext;
  errorMessage?: string;
}): Promise<void> => {
  const {
    analytics,
    apiConfig,
    authenticatedUser,
    coreStart,
    esClient,
    eventLogIndex,
    eventLogger,
    executionUuid,
    logger,
    pipelineStartedAt,
    request,
    spaceId,
  } = context;

  const runs = await getPipelinePhaseRuns({
    ...context,
    loadPhase: (_, status) => status !== ExecutionStatus.COMPLETED,
  }).catch((error: unknown): PipelinePhaseRuns => {
    logger.debug(
      () =>
        `Failed to read the child runs of pipeline generation ${executionUuid}: ${
          error instanceof Error ? error.message : String(error)
        }`
    );
    return {};
  });

  const failedPhase = PHASES.find((phase) => {
    const execution = runs[phase]?.execution;
    return execution != null && execution.status !== 'completed';
  });
  const failedRun = failedPhase != null ? runs[failedPhase] : undefined;
  const failedExecution = failedRun?.execution;
  const classification: FailedRunClassification | undefined =
    failedPhase != null && failedRun != null && failedExecution != null
      ? classifyFailedRun({
          apiConfig,
          execution: failedExecution,
          executionUuid,
          logger,
          phase: failedPhase,
          workflowId: failedRun.tracking.workflowId,
        })
      : undefined;
  // A Liquid reference that resolves to nothing renders as an empty string, not undefined.
  const message =
    classification?.message ||
    errorMessage?.trim() ||
    'The Attack Discovery pipeline workflow failed';
  const endTime = new Date();
  const event = {
    authenticatedUser,
    connectorId: apiConfig.connector_id,
    eventLogger,
    eventLogIndex,
    executionUuid,
    logger,
    spaceId,
    workflowExecutions: buildWorkflowExecutions(runs),
  };

  if (failedPhase != null && failedRun != null && failedExecution != null) {
    const { startTime } = getRunTimes(failedExecution);
    const phaseEvent = {
      ...event,
      endTime,
      errorMessage: message,
      startTime,
      workflowId: failedRun.tracking.workflowId,
      workflowRunId: failedRun.tracking.workflowRunId,
    };

    if (failedPhase === 'alertRetrieval') {
      await writeAlertRetrievalFailedEvent({
        ...phaseEvent,
        errorCategory: classification?.errorCategory,
        failedWorkflowId: classification?.failedWorkflowId,
      });
    } else if (failedPhase === 'generation') {
      await writeGenerateStepFailedEvent({ ...phaseEvent, alertsContextCount: 0 });
    } else {
      await writeValidationFailedEvent(phaseEvent);
    }
  }

  await writeGenerationFailedEvent({
    authenticatedUser,
    connectorId: apiConfig.connector_id,
    endTime,
    errorCategory: classification?.errorCategory,
    errorMessage: message,
    eventLogger,
    eventLogIndex,
    executionUuid,
    failedWorkflowId: classification?.failedWorkflowId,
    logger,
    spaceId,
    startTime: pipelineStartedAt,
    workflowId: resolveDefaultWorkflowIds().generation,
  });

  await refreshEventLogIndex({ coreStart, esClient, eventLogIndex, logger, request });

  if (analytics != null) {
    reportWorkflowError({
      analytics,
      logger,
      params: {
        actionTypeId: apiConfig.action_type_id,
        errorMessage: message,
        execution_mode: 'workflow',
        failed_step: failedPhase != null ? TELEMETRY_STEPS[failedPhase] : undefined,
        misconfiguration_detected: false,
        model: apiConfig.model,
        provider: apiConfig.provider,
        trigger: 'workflow',
      },
    });
  }
};
