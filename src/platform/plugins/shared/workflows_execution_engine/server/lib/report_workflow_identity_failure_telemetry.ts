/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart, Logger } from '@kbn/core/server';
import type { EsWorkflowExecution, EsWorkflowStepExecution } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { classifyWorkflowIdentityFailure } from './classify_workflow_identity_failure';
import { WorkflowExecutionTelemetryClient } from './telemetry/workflow_execution_telemetry_client';
import type { StepExecutionRepository } from '../repositories/step_execution_repository';
import { SERVICE_ACCOUNT_EXECUTION_ERROR_TYPE } from '../service_account_execution';

/** Upper bound on the stored step executions read for one report, the engine's usual search size. */
export const MAX_IDENTITY_FAILURE_STEP_EXECUTIONS = 10_000;

/** The step fields the run telemetry reads, so the read never loads step inputs or outputs. */
const STEP_TELEMETRY_FIELDS: Array<keyof EsWorkflowStepExecution> = [
  'executionTimeMs',
  'finishedAt',
  'id',
  'scopeStack',
  'startedAt',
  'status',
  'stepId',
  'stepType',
];

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const readStoredStepExecutions = async ({
  execution,
  logger,
  stepExecutionRepository,
}: {
  execution: EsWorkflowExecution;
  logger: Logger;
  stepExecutionRepository: StepExecutionRepository;
}): Promise<EsWorkflowStepExecution[]> => {
  const stepExecutionIds = execution.stepExecutionIds ?? [];
  if (stepExecutionIds.length === 0) {
    return [];
  }

  try {
    return await stepExecutionRepository.getStepExecutionsByIds(
      // Ids are stored in start order, so the newest steps, including the one that was waiting, are last.
      stepExecutionIds.slice(-MAX_IDENTITY_FAILURE_STEP_EXECUTIONS),
      STEP_TELEMETRY_FIELDS
    );
  } catch (error) {
    logger.debug(
      `Reporting identity-failure telemetry for workflow execution ${
        execution.id
      } without its steps: ${toMessage(error)}`
    );
    return [];
  }
};

const isServiceAccountExecutionEnabled = (core: Pick<CoreStart, 'security'>): boolean => {
  try {
    return core.security.serviceAccounts.isEnabled();
  } catch {
    return true;
  }
};

/**
 * Best-effort run telemetry for an execution that ended on its service account before its first
 * step, which never reaches the runtime manager's terminal report. Reports `_failed` with a fixed
 * reason instead of the raw error, or `_cancelled` when a cancellation won. It never rejects, so
 * callers can fire and forget it.
 */
export const reportWorkflowIdentityFailureTelemetry = async ({
  core,
  error,
  execution,
  logger,
  stepExecutionRepository,
}: {
  core: Pick<CoreStart, 'analytics' | 'security'>;
  error: unknown;
  execution: EsWorkflowExecution;
  logger: Logger;
  stepExecutionRepository: StepExecutionRepository;
}): Promise<void> => {
  if (
    execution.status !== ExecutionStatus.FAILED &&
    execution.status !== ExecutionStatus.CANCELLED
  ) {
    return;
  }

  try {
    const stepExecutions = await readStoredStepExecutions({
      execution,
      logger,
      stepExecutionRepository,
    });
    const reportedExecution: EsWorkflowExecution =
      execution.status === ExecutionStatus.FAILED
        ? {
            ...execution,
            error: {
              message: classifyWorkflowIdentityFailure({
                error,
                serviceAccountsEnabled: isServiceAccountExecutionEnabled(core),
              }),
              type: SERVICE_ACCOUNT_EXECUTION_ERROR_TYPE,
            },
          }
        : execution;

    new WorkflowExecutionTelemetryClient(core.analytics, logger).reportWorkflowExecutionTerminated({
      finalStatus: execution.status,
      stepExecutions,
      workflowExecution: reportedExecution,
    });
  } catch (reportError) {
    logger.debug(
      `Failed to report identity-failure telemetry for workflow execution ${
        execution.id
      }: ${toMessage(reportError)}`
    );
  }
};
