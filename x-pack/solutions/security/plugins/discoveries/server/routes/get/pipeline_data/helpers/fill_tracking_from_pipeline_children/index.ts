/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { ChildWorkflowExecutionItem } from '@kbn/workflows';
import { resolveDefaultWorkflowIds } from '@kbn/discoveries/impl/attack_discovery/generation/resolve_default_workflow_ids';
import type {
  WorkflowExecutionTracking,
  WorkflowExecutionsTracking,
} from '@kbn/discoveries/impl/attack_discovery/persistence/event_logging';

/** The subset of the workflows management API used to read a pipeline's child executions. */
export interface ChildWorkflowExecutionsApi {
  getChildWorkflowExecutions: (
    parentExecutionId: string,
    spaceId: string,
    request: KibanaRequest
  ) => Promise<ChildWorkflowExecutionItem[]>;
}

const toWorkflowExecutionTracking = ({
  executionId,
  workflowId,
  workflowName,
}: ChildWorkflowExecutionItem): WorkflowExecutionTracking => ({
  workflowId,
  ...(workflowName.length > 0 ? { workflowName } : {}),
  workflowRunId: executionId,
});

const getChildRefs = (
  children: ChildWorkflowExecutionItem[],
  workflowId: string
): WorkflowExecutionTracking[] =>
  children.filter((child) => child.workflowId === workflowId).map(toWorkflowExecutionTracking);

// Children are listed in the order the pipeline started them, so the last one is the latest attempt
const getLatestChildRef = (
  children: ChildWorkflowExecutionItem[],
  workflowId: string
): WorkflowExecutionTracking | null =>
  getChildRefs(children, workflowId).reduce<WorkflowExecutionTracking | null>(
    (_latest, ref) => ref,
    null
  );

/** Links phases missing from the event log to the pipeline's child workflow executions (event-log refs win). */
export const fillTrackingFromPipelineChildren = async <T extends WorkflowExecutionsTracking>({
  logger,
  pipelineRunId,
  request,
  spaceId,
  tracking,
  workflowsManagementApi,
}: {
  logger: Logger;
  /** The pipeline workflow's own execution id; absent for orchestrator-run generations */
  pipelineRunId: string | undefined;
  /** The viewer's request, so child executions are read with the viewer's privileges */
  request: KibanaRequest;
  spaceId: string;
  tracking: T;
  workflowsManagementApi: ChildWorkflowExecutionsApi;
}): Promise<T> => {
  if (pipelineRunId == null) {
    return tracking;
  }

  const isAlertRetrievalMissing =
    tracking.alertRetrieval == null || tracking.alertRetrieval.length === 0;
  const isGenerationMissing = tracking.generation == null;
  const isValidationMissing = tracking.validation == null;

  if (!isAlertRetrievalMissing && !isGenerationMissing && !isValidationMissing) {
    return tracking;
  }

  try {
    const children = await workflowsManagementApi.getChildWorkflowExecutions(
      pipelineRunId,
      spaceId,
      request
    );

    const {
      default_alert_retrieval: alertRetrievalWorkflowId,
      generation: generationWorkflowId,
      validate: validateWorkflowId,
    } = resolveDefaultWorkflowIds();

    const alertRetrievalRefs = getChildRefs(children, alertRetrievalWorkflowId);

    return {
      ...tracking,
      alertRetrieval:
        isAlertRetrievalMissing && alertRetrievalRefs.length > 0
          ? alertRetrievalRefs
          : tracking.alertRetrieval,
      generation: tracking.generation ?? getLatestChildRef(children, generationWorkflowId),
      validation: tracking.validation ?? getLatestChildRef(children, validateWorkflowId),
    };
  } catch (error) {
    logger.debug(
      () =>
        `Unable to read child executions of pipeline workflow execution ${pipelineRunId}: ${
          error instanceof Error ? error.message : String(error)
        }`
    );

    return tracking;
  }
};
