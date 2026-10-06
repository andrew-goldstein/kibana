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
import type { z } from '@kbn/zod/v4';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import {
  INVESTIGATION_STATUS_CHANGE_TRIGGER_ID,
  ReportInvestigationStatusChangeStepId,
  reportInvestigationStatusChangeStepCommonDefinition,
  reportInvestigationStatusChangeStepInputSchema,
} from '../../../common/step_types';
import type { AlertZeroTelemetryAnalytics } from '../../telemetry';
import { ALERTZERO_TELEMETRY_EVENTS, createAlertZeroTelemetryReporter } from '../../telemetry';
import { checkWorkflowManaged } from '../report_worker_outcome/check_workflow_managed';
import { withTimeout } from '../report_worker_outcome/with_timeout';
import type { InvestigationReader } from './create_investigation_reader';
import { mapWriteSourceToWriter } from './map_write_source';
import type { InvestigationConversation } from './read_investigation_status';
import { readInvestigationStatus } from './read_investigation_status';
import type { ReportInvestigationStatusChangeSkipReason } from './skip_reasons';
import { WARN_SKIP_REASONS } from './skip_reasons';

/** Budget for each read the step makes. */
export const READ_TIMEOUT_MS = 5000;

export interface ReportInvestigationStatusChangeStepDeps {
  analytics: AlertZeroTelemetryAnalytics;
  /** AlertZero's owner-bound managed workflows client, once start has resolved it. */
  getManagedWorkflowState: () => Promise<ManagedWorkflowStateApi | undefined>;
  /** Whether telemetry is opted in; read before any other read, so an opted-out cluster pays none. */
  isTelemetryOptedIn: () => Promise<boolean>;
  /** The AlertZero server logger; skip reasons never reach the workflow event log. */
  logger: Logger;
  readInvestigation: InvestigationReader;
}

type StepOutcome =
  | { reported: true }
  | { detail?: string; reason: ReportInvestigationStatusChangeSkipReason; reported: false };

const skipped = (
  reason: ReportInvestigationStatusChangeSkipReason,
  detail?: string
): StepOutcome => ({
  detail,
  reason,
  reported: false,
});

/** Issue paths and codes only: the rendered values may carry text the step must not log. */
const describeIssues = (issues: readonly z.core.$ZodIssue[]): string =>
  issues.map(({ code, path }) => `${path.join('.') || '(root)'}: ${code}`).join('; ');

type ReadResult =
  | { conversation: InvestigationConversation; found: true }
  | { found: false; reason: 'not_found' | 'read_failed' };

const readConversation = async (
  read: () => Promise<InvestigationConversation | undefined>
): Promise<ReadResult> => {
  try {
    const conversation = await withTimeout(read(), READ_TIMEOUT_MS);
    return conversation ? { conversation, found: true } : { found: false, reason: 'not_found' };
  } catch {
    return { found: false, reason: 'read_failed' };
  }
};

const verifyAndReport = async (
  deps: ReportInvestigationStatusChangeStepDeps,
  { abortSignal, contextManager, input }: StepHandlerContext
): Promise<StepOutcome> => {
  const parsed = reportInvestigationStatusChangeStepInputSchema.safeParse(input);
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
  if (execution.triggeredBy !== INVESTIGATION_STATUS_CHANGE_TRIGGER_ID) {
    return skipped('not_conversation_trigger');
  }
  const writer = mapWriteSourceToWriter(parsed.data.source);
  if (!writer) {
    return skipped('excluded_source');
  }
  if (!(await deps.isTelemetryOptedIn())) {
    return skipped('opted_out');
  }

  const unmanaged = await checkWorkflowManaged({
    getManagedWorkflowState: deps.getManagedWorkflowState,
    hopTimeoutMs: READ_TIMEOUT_MS,
    spaceId: workflow.spaceId,
    workflowId: workflow.id,
  });
  if (unmanaged) {
    return skipped(unmanaged === 'not_managed' ? 'not_managed' : 'lineage_unavailable');
  }
  if (abortSignal.aborted) {
    return skipped('aborted');
  }

  const { investigation_id: investigationId } = parsed.data;
  const request = contextManager.getFakeRequest();
  const read = await readConversation(() => deps.readInvestigation(request, investigationId));
  if (!read.found) {
    return skipped(read.reason);
  }
  const reading = readInvestigationStatus(read.conversation);
  if (!reading.valid) {
    return skipped(reading.reason);
  }
  if (abortSignal.aborted) {
    return skipped('aborted');
  }

  const report = createAlertZeroTelemetryReporter({
    analytics: deps.analytics,
    logger: deps.logger,
  });
  const reported = report(ALERTZERO_TELEMETRY_EVENTS.InvestigationStatusChanged, {
    ...(reading.closeReason === undefined ? {} : { close_reason: reading.closeReason }),
    investigation_id: investigationId,
    is_default_space: workflow.spaceId === DEFAULT_SPACE_ID,
    status: reading.status,
    writer,
  });
  return reported ? { reported: true } : skipped('report_error');
};

const logSkip = (
  logger: Logger,
  reason: ReportInvestigationStatusChangeSkipReason,
  detail?: string
) => {
  const message = `Skipped ${ReportInvestigationStatusChangeStepId} (${reason})${
    detail ? `: ${detail}` : ''
  }`;
  if (WARN_SKIP_REASONS.has(reason)) {
    logger.warn(message);
    return;
  }
  logger.debug(() => message);
};

/**
 * Reports an Investigation's status, read after the write, when the caller is AlertZero's managed
 * Investigation status listener. It never throws and outputs only `{ reported }`.
 */
export const getReportInvestigationStatusChangeStepDefinition = (
  deps: ReportInvestigationStatusChangeStepDeps
) =>
  createServerStepDefinition({
    ...reportInvestigationStatusChangeStepCommonDefinition,
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
