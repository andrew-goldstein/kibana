/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AuthenticatedUser,
  CoreStart,
  ElasticsearchClient,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import type { WorkflowExecutionDto } from '@kbn/workflows';

import { writeGenerationFailedEvent } from '../../execute_generation_workflow';
import { refreshEventLogIndex } from '../../refresh_event_log_index';
import { resolveDefaultWorkflowIds } from '../../resolve_default_workflow_ids';
import { getRunTimes } from '../get_run_times';
import { isStrandedPipelineRun } from '../is_stranded_pipeline_run';
import type { ReconcileWorkflowsApi } from '../types';

export const STRANDED_GENERATION_MESSAGE =
  'The batch timed out or was cancelled before it finished';

/** The pipeline step whose output holds the generation's `execution_uuid` and `api_config`. */
const START_STEP_ID = 'start_generation';

/** The engine also records the step's `on-failure` wrapper under the same `stepId`. */
const TRACK_GENERATION_STEP_TYPE = 'security.attack-discovery.trackGeneration';

interface StartedGeneration {
  connectorId: string;
  executionUuid: string;
}

const getStartedGeneration = (execution: WorkflowExecutionDto): StartedGeneration | undefined => {
  const output = execution.stepExecutions.find(
    ({ stepId, stepType }) => stepId === START_STEP_ID && stepType === TRACK_GENERATION_STEP_TYPE
  )?.output;
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    return undefined;
  }

  const { api_config: apiConfig, execution_uuid: executionUuid } = output as {
    api_config?: { connector_id?: unknown };
    execution_uuid?: unknown;
  };
  const connectorId = apiConfig?.connector_id;

  return typeof executionUuid === 'string' &&
    executionUuid !== '' &&
    typeof connectorId === 'string'
    ? { connectorId, executionUuid }
    : undefined;
};

/**
 * Writes generation-failed for each batch pipeline run of the parent run that timed out, was
 * cancelled, or was left running before it recorded its generation's outcome. Returns how many
 * generations it marked failed.
 */
export const reconcilePipelineGenerations = async ({
  authenticatedUser,
  coreStart,
  esClient,
  eventLogIndex,
  eventLogger,
  logger,
  parentExecutionId,
  pipelineWorkflowId,
  request,
  spaceId,
  workflowsManagementApi,
}: {
  authenticatedUser: AuthenticatedUser;
  coreStart: CoreStart;
  esClient: ElasticsearchClient;
  eventLogIndex: string;
  eventLogger: IEventLogger;
  logger: Logger;
  parentExecutionId: string;
  pipelineWorkflowId: string;
  request: KibanaRequest;
  spaceId: string;
  workflowsManagementApi: ReconcileWorkflowsApi;
}): Promise<number> => {
  const children = await workflowsManagementApi.getChildWorkflowExecutions(
    parentExecutionId,
    spaceId,
    request
  );
  const stranded = children.filter((child) => isStrandedPipelineRun({ child, pipelineWorkflowId }));

  const reconcileRun = async (executionId: string): Promise<boolean> => {
    const execution = await workflowsManagementApi
      .getWorkflowExecution(executionId, spaceId, { includeOutput: true, request })
      .catch((error: unknown) => {
        logger.debug(
          () =>
            `Failed to read stranded pipeline run ${executionId}: ${
              error instanceof Error ? error.message : String(error)
            }`
        );
        return null;
      });
    const generation = execution != null ? getStartedGeneration(execution) : undefined;
    if (execution == null || generation == null) {
      return false;
    }

    const { endTime, startTime } = getRunTimes(execution);
    await writeGenerationFailedEvent({
      authenticatedUser,
      connectorId: generation.connectorId,
      endTime,
      errorMessage: STRANDED_GENERATION_MESSAGE,
      eventLogIndex,
      eventLogger,
      executionUuid: generation.executionUuid,
      logger,
      spaceId,
      startTime,
      workflowId: resolveDefaultWorkflowIds().generation,
    });
    return true;
  };

  const results = await Promise.all(stranded.map(({ executionId }) => reconcileRun(executionId)));
  const reconciled = results.filter(Boolean).length;

  if (reconciled > 0) {
    await refreshEventLogIndex({ coreStart, esClient, eventLogIndex, logger, request });
  }

  return reconciled;
};
