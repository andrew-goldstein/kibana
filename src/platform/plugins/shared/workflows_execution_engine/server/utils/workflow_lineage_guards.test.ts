/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { hasParentWorkflowExecution, hasRootWorkflowLineage } from './workflow_lineage_guards';

describe('hasParentWorkflowExecution', () => {
  it('returns true when the context carries a string parentWorkflowExecutionId', () => {
    expect(hasParentWorkflowExecution({ parentWorkflowExecutionId: 'parent-exec-1' })).toBe(true);
  });

  it('returns false when parentWorkflowExecutionId is missing', () => {
    expect(hasParentWorkflowExecution({ parentWorkflowId: 'parent-workflow-id' })).toBe(false);
  });

  it('returns false when parentWorkflowExecutionId is not a string', () => {
    expect(hasParentWorkflowExecution({ parentWorkflowExecutionId: 42 })).toBe(false);
  });

  it('returns false for an undefined context', () => {
    expect(hasParentWorkflowExecution(undefined)).toBe(false);
  });
});

describe('hasRootWorkflowLineage', () => {
  it('returns true when both root keys are strings', () => {
    expect(
      hasRootWorkflowLineage({
        rootWorkflowExecutionId: 'root-exec-1',
        rootWorkflowId: 'root-wf',
      })
    ).toBe(true);
  });

  it('returns false when rootWorkflowId is missing', () => {
    expect(hasRootWorkflowLineage({ rootWorkflowExecutionId: 'root-exec-1' })).toBe(false);
  });

  it('returns false when rootWorkflowExecutionId is missing', () => {
    expect(hasRootWorkflowLineage({ rootWorkflowId: 'root-wf' })).toBe(false);
  });

  it('returns false when a root key is not a string', () => {
    expect(hasRootWorkflowLineage({ rootWorkflowExecutionId: 7, rootWorkflowId: 'root-wf' })).toBe(
      false
    );
  });

  it('returns false for an undefined context', () => {
    expect(hasRootWorkflowLineage(undefined)).toBe(false);
  });
});
