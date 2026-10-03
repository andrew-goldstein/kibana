/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createStepHandlerContext } from '../../test_utils/workflow_steps';
import { getWorkflowConversationSource } from './get_workflow_conversation_source';

describe('getWorkflowConversationSource', () => {
  const createContext = (executionContext: object) => {
    const context = createStepHandlerContext();
    (context.contextManager.getContext as jest.Mock).mockReturnValue(executionContext);
    return context;
  };

  it('builds a workflow source from the step execution context', () => {
    const context = createContext({
      execution: { id: 'exec-1', isTestRun: false },
      workflow: { id: 'wf-1', spaceId: 'space-a' },
    });

    expect(getWorkflowConversationSource(context)).toEqual({
      isTestRun: false,
      type: 'workflow',
      workflowExecutionId: 'exec-1',
      workflowId: 'wf-1',
    });
  });

  it('carries test runs', () => {
    const context = createContext({
      execution: { id: 'exec-2', isTestRun: true },
      workflow: { id: 'wf-2', spaceId: 'space-a' },
    });

    expect(getWorkflowConversationSource(context)).toEqual(
      expect.objectContaining({ isTestRun: true, workflowExecutionId: 'exec-2' })
    );
  });

  it('never reads step input, so a step cannot choose its own source', () => {
    const context = createStepHandlerContext({
      input: {
        source: { type: 'http_api' },
        workflowExecutionId: 'forged',
        workflowId: 'forged',
      },
    });

    expect(getWorkflowConversationSource(context)).toEqual({
      isTestRun: false,
      type: 'workflow',
      workflowExecutionId: 'workflow-execution-1',
      workflowId: 'workflow-1',
    });
  });
});
