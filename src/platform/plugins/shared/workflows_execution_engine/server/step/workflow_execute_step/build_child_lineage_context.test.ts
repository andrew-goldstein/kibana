/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildChildLineageContext } from './build_child_lineage_context';

describe('buildChildLineageContext', () => {
  it('uses the parent itself as the root when the parent is a top-level execution', () => {
    expect(
      buildChildLineageContext({
        context: { inputs: {} },
        id: 'top-exec-1',
        workflowId: 'top-workflow-id',
      })
    ).toEqual({
      rootWorkflowExecutionId: 'top-exec-1',
      rootWorkflowId: 'top-workflow-id',
    });
  });

  it('uses the parent itself as the root when the parent has no context', () => {
    expect(
      buildChildLineageContext({
        context: undefined,
        id: 'top-exec-1',
        workflowId: 'top-workflow-id',
      })
    ).toEqual({
      rootWorkflowExecutionId: 'top-exec-1',
      rootWorkflowId: 'top-workflow-id',
    });
  });

  it('ignores root keys on a top-level parent and uses the parent itself', () => {
    expect(
      buildChildLineageContext({
        context: { rootWorkflowExecutionId: 'other-exec', rootWorkflowId: 'other-workflow-id' },
        id: 'top-exec-1',
        workflowId: 'top-workflow-id',
      })
    ).toEqual({
      rootWorkflowExecutionId: 'top-exec-1',
      rootWorkflowId: 'top-workflow-id',
    });
  });

  it("copies the parent's stored root when the parent is itself a child", () => {
    expect(
      buildChildLineageContext({
        context: {
          parentWorkflowExecutionId: 'top-exec-1',
          parentWorkflowId: 'top-workflow-id',
          rootWorkflowExecutionId: 'top-exec-1',
          rootWorkflowId: 'top-workflow-id',
        },
        id: 'child-exec-1',
        workflowId: 'child-workflow-id',
      })
    ).toEqual({
      rootWorkflowExecutionId: 'top-exec-1',
      rootWorkflowId: 'top-workflow-id',
    });
  });

  it('returns no root keys when the parent is a child without a stored root', () => {
    expect(
      buildChildLineageContext({
        context: {
          parentWorkflowExecutionId: 'unknown-exec',
          parentWorkflowId: 'unknown-workflow-id',
        },
        id: 'pre-upgrade-child-exec',
        workflowId: 'pre-upgrade-child-workflow-id',
      })
    ).toEqual({});
  });

  it('returns no root keys when the parent child carries only one root key', () => {
    expect(
      buildChildLineageContext({
        context: {
          parentWorkflowExecutionId: 'unknown-exec',
          rootWorkflowExecutionId: 'top-exec-1',
        },
        id: 'child-exec-1',
        workflowId: 'child-workflow-id',
      })
    ).toEqual({});
  });
});
