/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConversationLifecycleSource,
  ConversationLifecycleWorkflowSource,
} from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import type { ManagedWorkflowInstanceState } from '@kbn/workflows/server/types';
import type { AlertZeroInvestigationActorClass, AlertZeroWorkerId } from '../telemetry';
import { resolveWorkerCatalogFields } from '../telemetry';

/** Who made an Investigation write, and for a Worker, its catalog id. */
export interface InvestigationActor {
  actorClass: AlertZeroInvestigationActorClass;
  workerId?: AlertZeroWorkerId;
}

/** Reads the workflow AlertZero installed with this id, or `null` when it owns none. */
export type ReadInstalledWorkflow = (params: {
  spaceId: string;
  workflowId: string;
}) => Promise<ManagedWorkflowInstanceState | null>;

export interface ClassifyInvestigationActorParams {
  logger: Logger;
  readInstalledWorkflow: ReadInstalledWorkflow;
  source: ConversationLifecycleSource;
  /** The conversation's space, bound by Agent Builder. */
  spaceId: string;
}

const CUSTOM_WORKFLOW: InvestigationActor = { actorClass: 'custom_workflow' };

const classifyWorkflowSource = async ({
  logger,
  readInstalledWorkflow,
  source: { isTestRun, workflowId },
  spaceId,
}: Omit<ClassifyInvestigationActorParams, 'source'> & {
  source: ConversationLifecycleWorkflowSource;
}): Promise<InvestigationActor> => {
  // A test run inherits a managed workflow's id, and a write without a workflow id cannot be
  // attributed, so neither can count as a Worker.
  if (isTestRun === true || !workflowId) {
    return CUSTOM_WORKFLOW;
  }

  try {
    const installed = await readInstalledWorkflow({ spaceId, workflowId });
    return installed
      ? {
          actorClass: 'worker',
          workerId: resolveWorkerCatalogFields(installed.definitionId ?? installed.workflowId)
            .worker_id,
        }
      : CUSTOM_WORKFLOW;
  } catch (error) {
    logger.debug(
      () =>
        `Could not verify the workflow behind an Investigation write; classifying it as a custom workflow: ${
          error instanceof Error ? error.message : String(error)
        }`
    );
    return CUSTOM_WORKFLOW;
  }
};

/**
 * Classifies the Agent Builder lifecycle `source` of an Investigation write. A workflow is a
 * `worker` only when AlertZero's owner-bound managed check verifies it and it is not a test run;
 * any other workflow, including one the check cannot verify, is a `custom_workflow`.
 */
export const classifyInvestigationActor = async ({
  source,
  ...params
}: ClassifyInvestigationActorParams): Promise<InvestigationActor> => {
  switch (source.type) {
    case 'execution':
      return { actorClass: 'agent' };
    case 'http_api':
    case 'server_api':
      return { actorClass: 'user' };
    case 'workflow':
      return classifyWorkflowSource({ ...params, source });
  }
};
