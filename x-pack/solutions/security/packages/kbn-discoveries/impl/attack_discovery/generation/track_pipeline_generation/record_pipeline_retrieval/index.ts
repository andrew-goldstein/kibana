/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { extractAlertRetrievalResult } from '../../extract_alert_retrieval_result';
import { writeAlertRetrievalStartedEvent } from '../../write_alert_retrieval_started_event';
import { writeAlertRetrievalSucceededEvent } from '../../write_alert_retrieval_succeeded_event';
import { buildWorkflowExecutions } from '../build_workflow_executions';
import { getPipelinePhaseRuns } from '../get_pipeline_phase_runs';
import { getRunTimes } from '../get_run_times';
import type { PipelineGenerationContext } from '../types';

/** Writes the alert retrieval phase's started and succeeded events once its child run has ended. */
export const recordPipelineRetrieval = async (
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
    loadPhase: (phase) => phase === 'alertRetrieval',
  });
  const execution = runs.alertRetrieval?.execution;

  if (runs.alertRetrieval == null || execution == null) {
    logger.warn(`No alert retrieval run found for pipeline generation ${executionUuid}`);
    return;
  }

  const { tracking } = runs.alertRetrieval;
  const { alertsContextCount } = extractAlertRetrievalResult({ apiConfig, execution });
  const { endTime, startTime } = getRunTimes(execution);
  const event = {
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

  await writeAlertRetrievalStartedEvent(event);
  await writeAlertRetrievalSucceededEvent({ ...event, alertsContextCount, endTime });
};
