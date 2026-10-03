/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationLifecycleWorkflowSource } from '@kbn/agent-builder-server';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';

/** Attributes a conversation step's writes to the workflow execution running it, never to step input. */
export const getWorkflowConversationSource = (
  context: StepHandlerContext
): ConversationLifecycleWorkflowSource => {
  const { execution, workflow } = context.contextManager.getContext();
  return {
    isTestRun: execution.isTestRun,
    type: 'workflow',
    workflowExecutionId: execution.id,
    workflowId: workflow.id,
  };
};
