/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { ExecutionStatus, type ChildWorkflowExecutionItem } from '@kbn/workflows';
import type { WorkflowExecutionsTracking } from '@kbn/discoveries/impl/attack_discovery/persistence/event_logging';

import { fillTrackingFromPipelineChildren } from '.';

const ALERT_RETRIEVAL_WORKFLOW_ID = 'system-attack-discovery-alert-retrieval';
const GENERATION_WORKFLOW_ID = 'system-attack-discovery-generation';
const VALIDATE_WORKFLOW_ID = 'system-attack-discovery-validate';

const pipelineRunId = 'pipeline-run-id';
const spaceId = 'default';

const createChild = ({
  executionId,
  status = ExecutionStatus.COMPLETED,
  workflowId,
  workflowName = '',
}: {
  executionId: string;
  status?: ExecutionStatus;
  workflowId: string;
  workflowName?: string;
}): ChildWorkflowExecutionItem => ({
  executionId,
  parentStepExecutionId: `step-${executionId}`,
  status,
  stepExecutions: [],
  workflowId,
  workflowName,
});

const emptyTracking: WorkflowExecutionsTracking = {
  alertRetrieval: null,
  gate: null,
  generation: null,
  validation: null,
};

describe('fillTrackingFromPipelineChildren', () => {
  const logger = loggingSystemMock.createLogger();
  const request = httpServerMock.createKibanaRequest();
  const mockGetChildWorkflowExecutions = jest.fn();
  const workflowsManagementApi = { getChildWorkflowExecutions: mockGetChildWorkflowExecutions };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('links a running generation child that the event log has not recorded yet', async () => {
    mockGetChildWorkflowExecutions.mockResolvedValue([
      createChild({
        executionId: 'alert-retrieval-run-id',
        workflowId: ALERT_RETRIEVAL_WORKFLOW_ID,
        workflowName: 'Attack discovery alert retrieval',
      }),
      createChild({
        executionId: 'generation-run-id',
        status: ExecutionStatus.RUNNING,
        workflowId: GENERATION_WORKFLOW_ID,
        workflowName: 'Attack discovery generation',
      }),
    ]);

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: emptyTracking,
      workflowsManagementApi,
    });

    expect(result).toEqual({
      alertRetrieval: [
        {
          workflowId: ALERT_RETRIEVAL_WORKFLOW_ID,
          workflowName: 'Attack discovery alert retrieval',
          workflowRunId: 'alert-retrieval-run-id',
        },
      ],
      gate: null,
      generation: {
        workflowId: GENERATION_WORKFLOW_ID,
        workflowName: 'Attack discovery generation',
        workflowRunId: 'generation-run-id',
      },
      validation: null,
    });
  });

  it("reads the child executions of the pipeline run with the viewer's request", async () => {
    mockGetChildWorkflowExecutions.mockResolvedValue([]);

    await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: emptyTracking,
      workflowsManagementApi,
    });

    expect(mockGetChildWorkflowExecutions).toHaveBeenCalledWith(pipelineRunId, spaceId, request);
  });

  it('keeps event-log refs over child executions', async () => {
    const tracking: WorkflowExecutionsTracking = {
      alertRetrieval: [
        { workflowId: ALERT_RETRIEVAL_WORKFLOW_ID, workflowRunId: 'event-log-retrieval-run-id' },
      ],
      gate: null,
      generation: { workflowId: GENERATION_WORKFLOW_ID, workflowRunId: 'event-log-generation-id' },
      validation: null,
    };

    mockGetChildWorkflowExecutions.mockResolvedValue([
      createChild({
        executionId: 'child-retrieval-run-id',
        workflowId: ALERT_RETRIEVAL_WORKFLOW_ID,
      }),
      createChild({ executionId: 'child-generation-run-id', workflowId: GENERATION_WORKFLOW_ID }),
      createChild({
        executionId: 'child-validation-run-id',
        status: ExecutionStatus.RUNNING,
        workflowId: VALIDATE_WORKFLOW_ID,
      }),
    ]);

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking,
      workflowsManagementApi,
    });

    expect(result).toEqual({
      ...tracking,
      validation: { workflowId: VALIDATE_WORKFLOW_ID, workflowRunId: 'child-validation-run-id' },
    });
  });

  it('does not read child executions when every phase is already in the event log', async () => {
    const tracking: WorkflowExecutionsTracking = {
      alertRetrieval: [{ workflowId: ALERT_RETRIEVAL_WORKFLOW_ID, workflowRunId: 'retrieval-id' }],
      gate: null,
      generation: { workflowId: GENERATION_WORKFLOW_ID, workflowRunId: 'generation-id' },
      validation: { workflowId: VALIDATE_WORKFLOW_ID, workflowRunId: 'validation-id' },
    };

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking,
      workflowsManagementApi,
    });

    expect(result).toBe(tracking);
    expect(mockGetChildWorkflowExecutions).not.toHaveBeenCalled();
  });

  it('fills alert retrieval when the event-log array is empty', async () => {
    mockGetChildWorkflowExecutions.mockResolvedValue([
      createChild({ executionId: 'retrieval-run-id', workflowId: ALERT_RETRIEVAL_WORKFLOW_ID }),
    ]);

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: { ...emptyTracking, alertRetrieval: [] },
      workflowsManagementApi,
    });

    expect(result.alertRetrieval).toEqual([
      { workflowId: ALERT_RETRIEVAL_WORKFLOW_ID, workflowRunId: 'retrieval-run-id' },
    ]);
  });

  it('links a failed child execution', async () => {
    mockGetChildWorkflowExecutions.mockResolvedValue([
      createChild({
        executionId: 'failed-generation-run-id',
        status: ExecutionStatus.FAILED,
        workflowId: GENERATION_WORKFLOW_ID,
      }),
    ]);

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: emptyTracking,
      workflowsManagementApi,
    });

    expect(result.generation).toEqual({
      workflowId: GENERATION_WORKFLOW_ID,
      workflowRunId: 'failed-generation-run-id',
    });
  });

  it('links the latest child when the pipeline ran a phase more than once', async () => {
    mockGetChildWorkflowExecutions.mockResolvedValue([
      createChild({ executionId: 'first-validation-run-id', workflowId: VALIDATE_WORKFLOW_ID }),
      createChild({ executionId: 'second-validation-run-id', workflowId: VALIDATE_WORKFLOW_ID }),
    ]);

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: emptyTracking,
      workflowsManagementApi,
    });

    expect(result.validation).toEqual({
      workflowId: VALIDATE_WORKFLOW_ID,
      workflowRunId: 'second-validation-run-id',
    });
  });

  it('ignores child executions of workflows other than the default AD workflows', async () => {
    mockGetChildWorkflowExecutions.mockResolvedValue([
      createChild({ executionId: 'other-run-id', workflowId: 'some-other-workflow' }),
    ]);

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: emptyTracking,
      workflowsManagementApi,
    });

    expect(result).toEqual(emptyTracking);
  });

  it('preserves the extra event-log fields on the tracking data', async () => {
    mockGetChildWorkflowExecutions.mockResolvedValue([
      createChild({ executionId: 'generation-run-id', workflowId: GENERATION_WORKFLOW_ID }),
    ]);

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: { ...emptyTracking, pipelineRunId, providedAlerts: ['alert one'] },
      workflowsManagementApi,
    });

    expect(result).toEqual(
      expect.objectContaining({ pipelineRunId, providedAlerts: ['alert one'] })
    );
  });

  it('does not read child executions when there is no pipeline run id (orchestrator run)', async () => {
    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId: undefined,
      request,
      spaceId,
      tracking: emptyTracking,
      workflowsManagementApi,
    });

    expect(result).toBe(emptyTracking);
    expect(mockGetChildWorkflowExecutions).not.toHaveBeenCalled();
  });

  it('returns the tracking data unchanged when reading child executions throws', async () => {
    mockGetChildWorkflowExecutions.mockRejectedValue(new Error('Forbidden'));

    const result = await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: emptyTracking,
      workflowsManagementApi,
    });

    expect(result).toBe(emptyTracking);
  });

  it('logs the failure at debug level when reading child executions throws', async () => {
    mockGetChildWorkflowExecutions.mockRejectedValue(new Error('Forbidden'));

    await fillTrackingFromPipelineChildren({
      logger,
      pipelineRunId,
      request,
      spaceId,
      tracking: emptyTracking,
      workflowsManagementApi,
    });

    const [[message]] = logger.debug.mock.calls;

    expect(typeof message === 'function' ? message() : message).toBe(
      'Unable to read child executions of pipeline workflow execution pipeline-run-id: Forbidden'
    );
  });
});
