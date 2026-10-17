/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExecutionStatus, type WorkflowExecutionDto } from '@kbn/workflows';

import type { PipelinePhaseRun } from '../types';
import { buildWorkflowExecutions } from '.';

const buildRun = (workflowId: string, workflowRunId: string): PipelinePhaseRun => ({
  execution: { id: workflowRunId } as unknown as WorkflowExecutionDto,
  status: ExecutionStatus.COMPLETED,
  tracking: { workflowId, workflowName: `${workflowId} name`, workflowRunId },
});

describe('buildWorkflowExecutions', () => {
  it('returns the tracking of every phase when all phases are present', () => {
    const alertRetrieval = buildRun('retrieval-workflow', 'retrieval-run');
    const generation = buildRun('generation-workflow', 'generation-run');
    const validation = buildRun('validation-workflow', 'validation-run');

    expect(buildWorkflowExecutions({ alertRetrieval, generation, validation })).toEqual({
      alertRetrieval: [alertRetrieval.tracking],
      gate: null,
      generation: generation.tracking,
      validation: validation.tracking,
    });
  });

  it('returns null for every phase when no phase is present', () => {
    expect(buildWorkflowExecutions({})).toEqual({
      alertRetrieval: null,
      gate: null,
      generation: null,
      validation: null,
    });
  });
});
