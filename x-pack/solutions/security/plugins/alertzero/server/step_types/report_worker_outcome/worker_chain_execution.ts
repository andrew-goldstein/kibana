/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowExecutionDto, WorkflowYaml } from '@kbn/workflows';
import type { AlertZeroEnvelopeRoot } from '../../telemetry';
import type { ReportWorkerOutcomeSkipReason } from './skip_reasons';

/** The persisted execution fields the verification reads. A management `WorkflowExecutionDto` fits. */
export type WorkerChainExecution = Pick<
  WorkflowExecutionDto,
  | 'context'
  | 'id'
  | 'isTestRun'
  | 'managed'
  | 'managedBy'
  | 'originManagedWorkflowId'
  | 'spaceId'
  | 'triggeredBy'
  | 'workflowId'
> & {
  workflowDefinition?: Pick<WorkflowYaml, 'consts'> | null;
};

export type WorkerChainVerification =
  | { root: AlertZeroEnvelopeRoot; verified: true }
  | { reason: ReportWorkerOutcomeSkipReason; verified: false };

/** Reads one persisted execution in the reporting space, or `null` when it is missing or hidden. */
export type GetWorkerChainExecution = (executionId: string) => Promise<WorkerChainExecution | null>;
