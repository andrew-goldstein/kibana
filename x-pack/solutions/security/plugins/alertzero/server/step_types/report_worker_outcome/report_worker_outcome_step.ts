/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ManagedWorkflowStateApi } from '@kbn/workflows/server/types';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { z } from '@kbn/zod/v4';
import {
  ReportWorkerOutcomeStepId,
  reportWorkerOutcomeStepCommonDefinition,
  reportWorkerOutcomeStepInputSchema,
} from '../../../common/step_types';
import type { AlertZeroTelemetryAnalytics } from '../../telemetry';
import { buildAlertZeroEnvelope, createAlertZeroTelemetryReporter } from '../../telemetry';
import { checkWorkflowManaged } from './check_workflow_managed';
import { reportOutcome } from './report_outcome';
import type { ReportWorkerOutcomeSkipReason } from './skip_reasons';
import { WARN_SKIP_REASONS } from './skip_reasons';
import type { VerifiedChainCache } from './verified_chain_cache';
import { verifyWorkerChain } from './verify_worker_chain';

/** Budget for each Elasticsearch read the verification makes. */
export const HOP_TIMEOUT_MS = 5000;

/** The setup-contract management API; its `getWorkflowExecution` honors `omitStepExecutions`. */
export type WorkflowExecutionReader = Pick<
  WorkflowsServerPluginSetup['management'],
  'getWorkflowExecution'
>;

export interface ReportWorkerOutcomeStepDeps {
  analytics: AlertZeroTelemetryAnalytics;
  cache: VerifiedChainCache;
  /** AlertZero's owner-bound managed workflows client, once start has resolved it. */
  getManagedWorkflowState: () => Promise<ManagedWorkflowStateApi | undefined>;
  getWorkflowsManagement: () => WorkflowExecutionReader | undefined;
  /** The AlertZero server logger; skip reasons never reach the workflow event log. */
  logger: Logger;
}

type StepOutcome =
  | { reported: true }
  | { detail?: string; reason: ReportWorkerOutcomeSkipReason; reported: false };

const skipped = (reason: ReportWorkerOutcomeSkipReason, detail?: string): StepOutcome => ({
  detail,
  reason,
  reported: false,
});

/** Issue paths and codes only: the rendered values may carry text the step must not log. */
const describeIssues = (issues: readonly z.core.$ZodIssue[]): string =>
  issues.map(({ code, path }) => `${path.join('.') || '(root)'}: ${code}`).join('; ');

const verifyAndReport = async (
  deps: ReportWorkerOutcomeStepDeps,
  { abortSignal, contextManager, input }: StepHandlerContext
): Promise<StepOutcome> => {
  const parsed = reportWorkerOutcomeStepInputSchema.safeParse(input);
  if (!parsed.success) {
    return skipped('invalid_input', describeIssues(parsed.error.issues));
  }
  if (abortSignal.aborted) {
    return skipped('aborted');
  }

  const { execution, workflow } = contextManager.getContext();
  if (execution.isTestRun) {
    return skipped('test_run');
  }

  const unmanaged = await checkWorkflowManaged({
    getManagedWorkflowState: deps.getManagedWorkflowState,
    hopTimeoutMs: HOP_TIMEOUT_MS,
    spaceId: workflow.spaceId,
    workflowId: workflow.id,
  });
  if (unmanaged) {
    return skipped(unmanaged);
  }

  const management = deps.getWorkflowsManagement();
  if (!management) {
    return skipped('lineage_unavailable');
  }
  const request = contextManager.getFakeRequest();
  const chain = await verifyWorkerChain({
    abortSignal,
    cache: deps.cache,
    executionId: execution.id,
    getExecution: (executionId) =>
      management.getWorkflowExecution(executionId, workflow.spaceId, {
        omitStepExecutions: true,
        request,
      }),
    hopTimeoutMs: HOP_TIMEOUT_MS,
    spaceId: workflow.spaceId,
  });
  if (!chain.verified) {
    return skipped(chain.reason);
  }
  if (abortSignal.aborted) {
    return skipped('aborted');
  }

  const reported = reportOutcome({
    envelope: buildAlertZeroEnvelope({ executionId: execution.id, root: chain.root }),
    input: parsed.data,
    report: createAlertZeroTelemetryReporter({ analytics: deps.analytics, logger: deps.logger }),
  });
  return reported ? { reported: true } : skipped('report_error');
};

const logSkip = (logger: Logger, reason: ReportWorkerOutcomeSkipReason, detail?: string) => {
  const message = `Skipped ${ReportWorkerOutcomeStepId} (${reason})${detail ? `: ${detail}` : ''}`;
  if (WARN_SKIP_REASONS.has(reason)) {
    logger.warn(message);
    return;
  }
  logger.debug(() => message);
};

/**
 * Reports an allowlisted Worker outcome event when the calling chain is a managed AlertZero Worker
 * run. It never throws and outputs only `{ reported }`. Caller verification is best-effort until
 * the engine exposes a trusted execution identity.
 */
export const getReportWorkerOutcomeStepDefinition = (deps: ReportWorkerOutcomeStepDeps) =>
  createServerStepDefinition({
    ...reportWorkerOutcomeStepCommonDefinition,
    handler: async (context) => {
      const outcome = await verifyAndReport(deps, context).catch((error: unknown) =>
        skipped('report_error', error instanceof Error ? error.message : String(error))
      );
      if (!outcome.reported) {
        logSkip(deps.logger, outcome.reason, outcome.detail);
      }
      return { output: { reported: outcome.reported } };
    },
  });
