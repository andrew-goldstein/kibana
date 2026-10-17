/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExecutionStatus, type ChildWorkflowExecutionItem } from '@kbn/workflows';

import { isStrandedPipelineRun } from '.';

const PIPELINE_WORKFLOW_ID = 'batch-pipeline';
const RECORD_FAILURE_STEP_ID = 'workflow-level-on-failure_generate_discoveries_record_failure';

const buildChild = ({
  status,
  steps = [],
  workflowId = PIPELINE_WORKFLOW_ID,
}: {
  status: ExecutionStatus;
  steps?: Array<{ status: ExecutionStatus; stepId: string }>;
  workflowId?: string;
}): ChildWorkflowExecutionItem =>
  ({
    executionId: 'child-run',
    parentStepExecutionId: 'parent-step',
    status,
    stepExecutions: steps,
    workflowId,
    workflowName: 'Batch pipeline',
  } as unknown as ChildWorkflowExecutionItem);

describe('isStrandedPipelineRun', () => {
  it.each([ExecutionStatus.CANCELLED, ExecutionStatus.TIMED_OUT, ExecutionStatus.RUNNING])(
    'returns true for a %s pipeline run that recorded no outcome',
    (status) => {
      const child = buildChild({
        status,
        steps: [{ status: ExecutionStatus.COMPLETED, stepId: 'start_generation' }],
      });

      expect(isStrandedPipelineRun({ child, pipelineWorkflowId: PIPELINE_WORKFLOW_ID })).toBe(true);
    }
  );

  it('returns false for a completed pipeline run', () => {
    const child = buildChild({ status: ExecutionStatus.COMPLETED });

    expect(isStrandedPipelineRun({ child, pipelineWorkflowId: PIPELINE_WORKFLOW_ID })).toBe(false);
  });

  it('returns false when the run already recorded its success', () => {
    const child = buildChild({
      status: ExecutionStatus.CANCELLED,
      steps: [{ status: ExecutionStatus.COMPLETED, stepId: 'record_success' }],
    });

    expect(isStrandedPipelineRun({ child, pipelineWorkflowId: PIPELINE_WORKFLOW_ID })).toBe(false);
  });

  it('returns false when the run’s failure fallback already recorded the failure', () => {
    const child = buildChild({
      status: ExecutionStatus.FAILED,
      steps: [{ status: ExecutionStatus.COMPLETED, stepId: RECORD_FAILURE_STEP_ID }],
    });

    expect(isStrandedPipelineRun({ child, pipelineWorkflowId: PIPELINE_WORKFLOW_ID })).toBe(false);
  });

  it('returns true when the failure fallback started but did not complete', () => {
    const child = buildChild({
      status: ExecutionStatus.FAILED,
      steps: [{ status: ExecutionStatus.FAILED, stepId: RECORD_FAILURE_STEP_ID }],
    });

    expect(isStrandedPipelineRun({ child, pipelineWorkflowId: PIPELINE_WORKFLOW_ID })).toBe(true);
  });

  it('returns false for a child run of another workflow', () => {
    const child = buildChild({ status: ExecutionStatus.CANCELLED, workflowId: 'other-workflow' });

    expect(isStrandedPipelineRun({ child, pipelineWorkflowId: PIPELINE_WORKFLOW_ID })).toBe(false);
  });
});
