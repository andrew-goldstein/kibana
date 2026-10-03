/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import type { ReportWorkerOutcomeStepDeps } from './report_worker_outcome/report_worker_outcome_step';
import { getReportWorkerOutcomeStepDefinition } from './report_worker_outcome/report_worker_outcome_step';

/** Registers AlertZero's workflow steps during plugin setup. */
export const registerAlertZeroStepDefinitions = ({
  workflowsExtensions,
  ...deps
}: ReportWorkerOutcomeStepDeps & {
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
}): void => {
  workflowsExtensions.registerStepDefinition(getReportWorkerOutcomeStepDefinition(deps));
};
