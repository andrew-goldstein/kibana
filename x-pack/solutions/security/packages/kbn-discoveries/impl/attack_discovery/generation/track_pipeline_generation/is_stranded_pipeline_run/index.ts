/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExecutionStatus, type ChildWorkflowExecutionItem } from '@kbn/workflows';

const RECORD_SUCCESS_STEP_ID = 'record_success';

/**
 * `record_failure` runs in the workflow-level `on-failure` fallback, whose steps the engine
 * renames to `workflow-level-on-failure_<failed step>_<name>`.
 */
const RECORD_FAILURE_STEP_PREFIX = 'workflow-level-on-failure_';
const RECORD_FAILURE_STEP_SUFFIX = '_record_failure';

const isOutcomeStep = (stepId: string): boolean =>
  stepId === RECORD_SUCCESS_STEP_ID ||
  (stepId.startsWith(RECORD_FAILURE_STEP_PREFIX) && stepId.endsWith(RECORD_FAILURE_STEP_SUFFIX));

/**
 * Returns true when a child run of the pipeline workflow ended, or was left running, without
 * recording its generation's outcome.
 */
export const isStrandedPipelineRun = ({
  child,
  pipelineWorkflowId,
}: {
  child: ChildWorkflowExecutionItem;
  pipelineWorkflowId: string;
}): boolean => {
  if (child.workflowId !== pipelineWorkflowId || child.status === ExecutionStatus.COMPLETED) {
    return false;
  }

  return !child.stepExecutions.some(
    ({ status, stepId }) => isOutcomeStep(stepId) && status === ExecutionStatus.COMPLETED
  );
};
