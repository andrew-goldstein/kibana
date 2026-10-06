/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { ActionsService } from '../services/actions/actions_service';
import type { HuntServices } from '../services/watches/hunt/types';
import { getPackageReportStepDefinition } from './package_report';
import type { PackageReportStepDependencies } from './package_report/package_report_step';
import type { ReportWorkerOutcomeStepDeps } from './report_worker_outcome/report_worker_outcome_step';
import { getReportWorkerOutcomeStepDefinition } from './report_worker_outcome/report_worker_outcome_step';
import { createVerifiedChainCache } from './report_worker_outcome/verified_chain_cache';
import type { ReportInvestigationStatusChangeStepDeps } from './report_investigation_status_change/report_investigation_status_change_step';
import { getReportInvestigationStatusChangeStepDefinition } from './report_investigation_status_change/report_investigation_status_change_step';

export const registerStepDefinitions = ({
  workflowsExtensions,
  getActionsService,
  getConversations,
  getHuntServices,
  getResolveHostEnrollment,
  isContextEngineEnabled,
  logger,
}: {
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
  getActionsService: () => ActionsService;
  getConversations: () => AgentBuilderPluginStart['conversations'];
  getHuntServices: () => HuntServices;
  getResolveHostEnrollment?: PackageReportStepDependencies['getResolveHostEnrollment'];
  isContextEngineEnabled: PackageReportStepDependencies['isContextEngineEnabled'];
  logger?: Logger;
}) => {
  workflowsExtensions.registerStepDefinition(
    getPackageReportStepDefinition({
      getActionsService,
      getConversations,
      getHuntServices,
      getResolveHostEnrollment,
      isContextEngineEnabled,
      logger,
    })
  );
};

export { getPackageReportStepDefinition } from './package_report';

export { OPT_IN_TIMEOUT_MS as REPORT_STEP_OPT_IN_TIMEOUT_MS } from './report_worker_outcome/report_worker_outcome_step';

export { createInvestigationReader } from './report_investigation_status_change/create_investigation_reader';

/**
 * Registers the AlertZero telemetry steps during plugin setup: `alertzero.reportWorkerOutcome`
 * and `alertzero.reportInvestigationStatusChange`.
 */
export const registerAlertZeroStepDefinitions = ({
  readInvestigation,
  workflowsExtensions,
  ...deps
}: Omit<ReportWorkerOutcomeStepDeps, 'cache'> &
  Pick<ReportInvestigationStatusChangeStepDeps, 'readInvestigation'> & {
    workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
  }): void => {
  workflowsExtensions.registerStepDefinition(
    getReportWorkerOutcomeStepDefinition({ ...deps, cache: createVerifiedChainCache() })
  );
  workflowsExtensions.registerStepDefinition(
    getReportInvestigationStatusChangeStepDefinition({
      analytics: deps.analytics,
      getManagedWorkflowState: deps.getManagedWorkflowState,
      isTelemetryOptedIn: deps.isTelemetryOptedIn,
      logger: deps.logger,
      readInvestigation,
    })
  );
};
