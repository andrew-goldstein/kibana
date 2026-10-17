/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash/fp';

import { getDurationNanoseconds } from '../../../../lib/persistence';
import { reportWorkflowSuccess } from '../../../../lib/telemetry/report_workflow_telemetry';
import {
  ATTACK_DISCOVERY_EVENT_LOG_ACTION_GENERATION_SUCCEEDED,
  writeAttackDiscoveryEvent,
} from '../../../persistence/event_logging';
import { extractAlertRetrievalResult } from '../../extract_alert_retrieval_result';
import { extractGenerationWorkflowResult } from '../../invoke_generation_workflow';
import {
  extractValidationResult,
  writeValidationStartedEvent,
  writeValidationSucceededEvent,
} from '../../invoke_validation_workflow';
import { resolveDefaultWorkflowIds } from '../../resolve_default_workflow_ids';
import type { WorkflowConfig } from '../../types';
import { buildWorkflowExecutions } from '../build_workflow_executions';
import { getPipelinePhaseRuns } from '../get_pipeline_phase_runs';
import { getRunTimes } from '../get_run_times';
import type { PipelineGenerationContext } from '../types';

/**
 * Writes the events for a pipeline run that finished: the validation phase's events, or, when
 * retrieval found no alerts, a zero-alert generation-succeeded. Then reports the
 * `attack_discovery_success` telemetry event the orchestrator reports.
 */
export const recordPipelineSuccess = async ({
  alertsCount,
  context,
  workflowConfig,
}: {
  alertsCount: number;
  context: PipelineGenerationContext;
  workflowConfig: WorkflowConfig;
}): Promise<void> => {
  const {
    analytics,
    apiConfig,
    authenticatedUser,
    eventLogIndex,
    eventLogger,
    executionUuid,
    logger,
    pipelineStartedAt,
    spaceId,
  } = context;
  const runs = await getPipelinePhaseRuns({ ...context, loadPhase: () => true });
  const alertRetrievalExecution = runs.alertRetrieval?.execution;
  const generationExecution = runs.generation?.execution;
  const validationExecution = runs.validation?.execution;
  const workflowExecutions = buildWorkflowExecutions(runs);
  const event = {
    authenticatedUser,
    connectorId: apiConfig.connector_id,
    eventLogger,
    eventLogIndex,
    executionUuid,
    logger,
    spaceId,
    workflowExecutions,
  };

  const alertsContextCount =
    alertRetrievalExecution != null
      ? extractAlertRetrievalResult({ apiConfig, execution: alertRetrievalExecution })
          .alertsContextCount
      : 0;

  const attackDiscoveries =
    generationExecution != null
      ? (extractGenerationWorkflowResult({ execution: generationExecution, executionUuid })
          .attackDiscoveries as Array<{ alert_ids?: string[] }>)
      : [];

  const validation =
    validationExecution != null
      ? extractValidationResult({
          execution: validationExecution,
          generatedCount: attackDiscoveries.length,
          logger,
        })
      : undefined;

  if (generationExecution == null) {
    // Mirrors the orchestrator's zero-alert outcome, which skips generation and validation.
    const endTime = new Date();

    try {
      await writeAttackDiscoveryEvent({
        ...event,
        action: ATTACK_DISCOVERY_EVENT_LOG_ACTION_GENERATION_SUCCEEDED,
        alertsContextCount: 0,
        dataClient: null,
        duration: getDurationNanoseconds({ end: endTime, start: pipelineStartedAt }),
        end: endTime,
        message: `Attack discovery generation ${executionUuid} succeeded with no alerts to analyze`,
        outcome: 'success',
        start: pipelineStartedAt,
        workflowId: resolveDefaultWorkflowIds().generation,
      });
    } catch (error) {
      logger.error(
        `Failed to write generation-succeeded event for no-alerts outcome: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (runs.validation != null && validationExecution != null && validation != null) {
    const { endTime, startTime } = getRunTimes(validationExecution);
    const { workflowId, workflowRunId } = runs.validation.tracking;

    await writeValidationStartedEvent({ ...event, startTime, workflowId, workflowRunId });
    await writeValidationSucceededEvent({
      ...event,
      endTime,
      startTime,
      validationSummary: validation.validationSummary,
      workflowId,
      workflowRunId,
    });
  }

  if (analytics != null) {
    reportWorkflowSuccess({
      analytics,
      logger,
      params: {
        actionTypeId: apiConfig.action_type_id,
        alert_retrieval_mode: workflowConfig.alert_retrieval_mode,
        alertsContextCount,
        // The generate step's discoveries name their alerts `alert_ids`.
        alertsCount: uniq(attackDiscoveries.flatMap(({ alert_ids: alertIds }) => alertIds ?? []))
          .length,
        configuredAlertsCount: alertsCount,
        custom_retrieval_workflow_count: workflowConfig.alert_retrieval_workflow_ids.length,
        dateRangeDuration: 0,
        discoveriesGenerated: attackDiscoveries.length,
        duplicatesDroppedCount: validation?.duplicatesDroppedCount,
        durationMs: Date.now() - pipelineStartedAt.getTime(),
        execution_mode: 'workflow',
        hallucinations_filtered_count: validation?.validationSummary.hallucinationsFilteredCount,
        hasFilter: false,
        isDefaultDateRange: true,
        model: apiConfig.model,
        prebuilt_step_types_used: [],
        provider: apiConfig.provider,
        retrieval_workflow_count:
          workflowConfig.alert_retrieval_workflow_ids.length +
          (workflowConfig.default_retrieval_enabled ? 1 : 0),
        trigger: 'workflow',
        uses_default_retrieval: workflowConfig.default_retrieval_enabled,
        uses_default_validation: true,
        validation_discoveries_count: validation?.validationSummary.persistedCount,
      },
    });
  }
};
