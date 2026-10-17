/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AnalyticsServiceSetup,
  AuthenticatedUser,
  CoreStart,
  ElasticsearchClient,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import type {
  ChildWorkflowExecutionItem,
  ExecutionStatus,
  WorkflowExecutionDto,
  WorkflowExecutionListDto,
  WorkflowExecutionSortField,
  WorkflowExecutionSortOrder,
} from '@kbn/workflows';

import type { WorkflowsManagementApi } from '../invoke_alert_retrieval_workflow';
import type { ParsedApiConfig, WorkflowExecutionTracking } from '../types';

/**
 * The points in a pipeline workflow run at which its Attack Discovery generation is recorded.
 */
export type PipelineGenerationPhase =
  | 'failed'
  | 'generation_completed'
  | 'reconcile'
  | 'retrieval_completed'
  | 'started'
  | 'succeeded';

export type PipelineWorkflowsApi = WorkflowsManagementApi & {
  getChildWorkflowExecutions: (
    parentExecutionId: string,
    spaceId: string,
    request: KibanaRequest
  ) => Promise<ChildWorkflowExecutionItem[]>;
};

/** The pipeline API, plus the listing of a workflow's runs that reconciliation reads. */
export type ReconcileWorkflowsApi = PipelineWorkflowsApi & {
  getWorkflowExecutions: (
    params: {
      omitStepRuns?: boolean;
      request: KibanaRequest;
      size?: number;
      sortField?: WorkflowExecutionSortField;
      sortOrder?: WorkflowExecutionSortOrder;
      workflowId?: string;
    },
    spaceId: string
  ) => Promise<WorkflowExecutionListDto>;
};

/**
 * What every phase needs to record a generation that a pipeline workflow runs: the run's
 * identity, its event log, and the API used to read the pipeline's child runs.
 */
export interface PipelineGenerationContext {
  analytics?: AnalyticsServiceSetup;
  apiConfig: ParsedApiConfig;
  authenticatedUser: AuthenticatedUser;
  coreStart: CoreStart;
  esClient: ElasticsearchClient;
  eventLogger: IEventLogger;
  eventLogIndex: string;
  executionUuid: string;
  logger: Logger;
  pipelineRunId: string;
  pipelineStartedAt: Date;
  pipelineWorkflowId: string;
  request: KibanaRequest;
  spaceId: string;
  workflowsManagementApi: PipelineWorkflowsApi;
}

/**
 * One phase's child run: its status, the reference the event log records for it, and its
 * execution when the caller loaded it.
 */
export interface PipelinePhaseRun {
  execution?: WorkflowExecutionDto;
  status: ExecutionStatus;
  tracking: WorkflowExecutionTracking;
}

export interface PipelinePhaseRuns {
  alertRetrieval?: PipelinePhaseRun;
  generation?: PipelinePhaseRun;
  validation?: PipelinePhaseRun;
}
