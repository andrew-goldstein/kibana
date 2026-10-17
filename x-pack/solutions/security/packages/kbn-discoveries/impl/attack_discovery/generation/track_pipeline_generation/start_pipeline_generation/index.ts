/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SecurityPluginStart } from '@kbn/security-plugin/server';

import { assertAuthorizedToExecuteWorkflows } from '../../assert_authorized_to_execute_workflows';
import { buildResolveConnector } from '../../build_resolve_connector';
import {
  buildDiagnosticsContext,
  reportPreExecutionMisconfigurations,
} from '../../execute_generation_workflow';
import { getWorkflowLoadingMessage } from '../../get_workflow_loading_message';
import { refreshEventLogIndex } from '../../refresh_event_log_index';
import { resolveDefaultWorkflowIds } from '../../resolve_default_workflow_ids';
import type { ExecuteGenerationWorkflowParams, WorkflowConfig } from '../../types';
import { validatePreExecution } from '../../validate_pre_execution';
import { verifyWorkflowIntegrity } from '../../verify_workflow_integrity';
import { writeGenerationStartedEvent } from '../../write_generation_started_event';
import type { PipelineGenerationContext } from '../types';

/**
 * Runs the checks the orchestrator runs before a generation (authorization, managed workflow
 * integrity, pre-execution), then writes `generation-started` with the pipeline's run id.
 * Throws when a check fails, so the pipeline fails before it does any work.
 */
export const startPipelineGeneration = async ({
  alertsCount,
  alertsIndexPattern,
  authz,
  checkIntegrity,
  context,
  getStartServices,
  workflowConfig,
}: {
  alertsCount: number;
  alertsIndexPattern: string;
  authz: SecurityPluginStart['authz'];
  checkIntegrity: ExecuteGenerationWorkflowParams['checkIntegrity'];
  context: PipelineGenerationContext;
  getStartServices: ExecuteGenerationWorkflowParams['getStartServices'];
  workflowConfig: WorkflowConfig;
}): Promise<void> => {
  const {
    analytics,
    apiConfig,
    authenticatedUser,
    coreStart,
    esClient,
    eventLogIndex,
    eventLogger,
    executionUuid,
    logger,
    pipelineRunId,
    pipelineWorkflowId,
    request,
    spaceId,
    workflowsManagementApi,
  } = context;

  await assertAuthorizedToExecuteWorkflows({ authz, request, spaceId });

  const { integrityResult, updatedIds: verifiedWorkflowIds } = await verifyWorkflowIntegrity({
    checkIntegrity: checkIntegrity != null ? () => checkIntegrity({ logger, spaceId }) : undefined,
    defaultWorkflowIds: resolveDefaultWorkflowIds(),
    logger,
  });

  const preExecutionResult = await validatePreExecution({
    alertsIndexPattern,
    connectorId: apiConfig.connector_id,
    esClient,
    logger,
    resolveConnector: buildResolveConnector({
      connectorId: apiConfig.connector_id,
      getStartServices,
      request,
    }),
    workflowIntegrityResult: integrityResult,
    workflowsManagementApi,
  });

  if (preExecutionResult.issues.length > 0 && analytics != null) {
    reportPreExecutionMisconfigurations({
      analytics,
      issues: preExecutionResult.issues,
      logger,
      spaceId,
    });
  }

  if (!preExecutionResult.valid) {
    throw new Error(
      preExecutionResult.issues
        .filter(({ severity }) => severity === 'critical')
        .map(({ message }) => message)
        .join('; ')
    );
  }

  await writeGenerationStartedEvent({
    authenticatedUser,
    connectorId: apiConfig.connector_id,
    diagnosticsContext: buildDiagnosticsContext({
      integrityResult,
      parsedApiConfig: apiConfig,
      preExecutionResult,
      verifiedWorkflowIds,
      workflowConfig,
    }),
    eventLogger,
    eventLogIndex,
    executionUuid,
    loadingMessage: getWorkflowLoadingMessage({ alertsCount, workflowConfig }),
    spaceId,
    workflowId: pipelineWorkflowId,
    workflowRunId: pipelineRunId,
  });

  await refreshEventLogIndex({ coreStart, esClient, eventLogIndex, logger, request });
};
