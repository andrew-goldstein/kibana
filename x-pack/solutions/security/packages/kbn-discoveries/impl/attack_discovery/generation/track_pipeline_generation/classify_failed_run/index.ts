/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { ERROR_CATEGORIES, type ErrorCategory } from '@kbn/discoveries-schemas';
import type { WorkflowExecutionDto } from '@kbn/workflows';

import { AttackDiscoveryError } from '../../../../lib/errors/attack_discovery_error';
import { extractAlertRetrievalResult } from '../../extract_alert_retrieval_result';
import { extractGenerationWorkflowResult } from '../../invoke_generation_workflow';
import { extractValidationResult } from '../../invoke_validation_workflow';
import type { ParsedApiConfig } from '../../types';
import type { PipelinePhaseRuns } from '../types';

export interface FailedRunClassification {
  errorCategory?: ErrorCategory;
  failedWorkflowId: string;
  message: string;
}

/**
 * Classifies a phase's failed child run with the same extractor the orchestrator uses for that
 * phase, so the event log records the same error category and message.
 */
export const classifyFailedRun = ({
  apiConfig,
  execution,
  executionUuid,
  logger,
  phase,
  workflowId,
}: {
  apiConfig: ParsedApiConfig;
  execution: WorkflowExecutionDto;
  executionUuid: string;
  logger: Logger;
  phase: keyof PipelinePhaseRuns;
  /** The id of the phase's workflow, used when the run doesn't report one. */
  workflowId: string;
}): FailedRunClassification => {
  try {
    if (phase === 'alertRetrieval') {
      extractAlertRetrievalResult({ apiConfig, execution });
    } else if (phase === 'generation') {
      extractGenerationWorkflowResult({ execution, executionUuid });
    } else {
      extractValidationResult({ execution, generatedCount: 0, logger });
    }
  } catch (error) {
    if (error instanceof AttackDiscoveryError) {
      return {
        errorCategory: error.errorCategory,
        failedWorkflowId: error.workflowId ?? workflowId,
        message: error.message,
      };
    }
  }

  return {
    ...(execution.status === 'timed_out' ? { errorCategory: ERROR_CATEGORIES.timeout } : {}),
    failedWorkflowId: workflowId,
    message: execution.error?.message ?? `Workflow ${workflowId} ended with ${execution.status}`,
  };
};
