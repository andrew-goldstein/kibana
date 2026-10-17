/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { ExecutionStatus, type WorkflowExecutionDto } from '@kbn/workflows';

import { AttackDiscoveryError } from '../../../../lib/errors/attack_discovery_error';
import { classifyFailedRun } from '.';

const mockExtractAlertRetrievalResult = jest.fn();
const mockExtractGenerationWorkflowResult = jest.fn();
const mockExtractValidationResult = jest.fn();

jest.mock('../../extract_alert_retrieval_result', () => ({
  extractAlertRetrievalResult: (...args: unknown[]) => mockExtractAlertRetrievalResult(...args),
}));

jest.mock('../../invoke_generation_workflow', () => ({
  extractGenerationWorkflowResult: (...args: unknown[]) =>
    mockExtractGenerationWorkflowResult(...args),
}));

jest.mock('../../invoke_validation_workflow', () => ({
  extractValidationResult: (...args: unknown[]) => mockExtractValidationResult(...args),
}));

const apiConfig = { action_type_id: '.gen-ai', connector_id: 'connector-1' };
const logger = { debug: jest.fn(), warn: jest.fn() } as unknown as Logger;

const buildExecution = (overrides: Partial<WorkflowExecutionDto>): WorkflowExecutionDto =>
  ({
    error: null,
    id: 'child-run',
    status: ExecutionStatus.FAILED,
    ...overrides,
  } as unknown as WorkflowExecutionDto);

describe('classifyFailedRun', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe.each([
    ['alertRetrieval' as const, mockExtractAlertRetrievalResult],
    ['generation' as const, mockExtractGenerationWorkflowResult],
    ['validation' as const, mockExtractValidationResult],
  ])('when the %s extractor throws an AttackDiscoveryError', (phase, extractor) => {
    it('returns the error category, workflow id, and message of the error', () => {
      extractor.mockImplementation(() => {
        throw new AttackDiscoveryError({
          errorCategory: 'rate_limit',
          message: `${phase} was rate limited`,
          workflowId: 'workflow-from-error',
        });
      });

      expect(
        classifyFailedRun({
          apiConfig,
          execution: buildExecution({}),
          executionUuid: 'execution-uuid',
          logger,
          phase,
          workflowId: 'phase-workflow',
        })
      ).toEqual({
        errorCategory: 'rate_limit',
        failedWorkflowId: 'workflow-from-error',
        message: `${phase} was rate limited`,
      });
    });

    it('falls back to the phase workflow id when the error has none', () => {
      extractor.mockImplementation(() => {
        throw new AttackDiscoveryError({
          errorCategory: 'workflow_error',
          message: 'failed',
        });
      });

      expect(
        classifyFailedRun({
          apiConfig,
          execution: buildExecution({}),
          executionUuid: 'execution-uuid',
          logger,
          phase,
          workflowId: 'phase-workflow',
        }).failedWorkflowId
      ).toBe('phase-workflow');
    });
  });

  it('classifies an alert retrieval run with the alert retrieval extractor', () => {
    const execution = buildExecution({});

    classifyFailedRun({
      apiConfig,
      execution,
      executionUuid: 'execution-uuid',
      logger,
      phase: 'alertRetrieval',
      workflowId: 'phase-workflow',
    });

    expect(mockExtractAlertRetrievalResult).toHaveBeenCalledWith({ apiConfig, execution });
  });

  it('classifies a generation run with the generation extractor', () => {
    const execution = buildExecution({});

    classifyFailedRun({
      apiConfig,
      execution,
      executionUuid: 'execution-uuid',
      logger,
      phase: 'generation',
      workflowId: 'phase-workflow',
    });

    expect(mockExtractGenerationWorkflowResult).toHaveBeenCalledWith({
      execution,
      executionUuid: 'execution-uuid',
    });
  });

  it('classifies a validation run with the validation extractor', () => {
    const execution = buildExecution({});

    classifyFailedRun({
      apiConfig,
      execution,
      executionUuid: 'execution-uuid',
      logger,
      phase: 'validation',
      workflowId: 'phase-workflow',
    });

    expect(mockExtractValidationResult).toHaveBeenCalledWith({
      execution,
      generatedCount: 0,
      logger,
    });
  });

  it('returns the timeout category when the extractor does not throw and the run timed out', () => {
    expect(
      classifyFailedRun({
        apiConfig,
        execution: buildExecution({ status: ExecutionStatus.TIMED_OUT }),
        executionUuid: 'execution-uuid',
        logger,
        phase: 'generation',
        workflowId: 'phase-workflow',
      })
    ).toEqual({
      errorCategory: 'timeout',
      failedWorkflowId: 'phase-workflow',
      message: 'Workflow phase-workflow ended with timed_out',
    });
  });

  it('returns the error message of the run, without a category, when the extractor throws a plain error', () => {
    mockExtractGenerationWorkflowResult.mockImplementation(() => {
      throw new Error('plain error');
    });

    expect(
      classifyFailedRun({
        apiConfig,
        execution: buildExecution({
          error: { message: 'the run failed' } as WorkflowExecutionDto['error'],
        }),
        executionUuid: 'execution-uuid',
        logger,
        phase: 'generation',
        workflowId: 'phase-workflow',
      })
    ).toEqual({
      failedWorkflowId: 'phase-workflow',
      message: 'the run failed',
    });
  });

  it('describes the run status when the run reports no error message', () => {
    expect(
      classifyFailedRun({
        apiConfig,
        execution: buildExecution({ status: ExecutionStatus.CANCELLED }),
        executionUuid: 'execution-uuid',
        logger,
        phase: 'validation',
        workflowId: 'phase-workflow',
      })
    ).toEqual({
      failedWorkflowId: 'phase-workflow',
      message: 'Workflow phase-workflow ended with cancelled',
    });
  });
});
