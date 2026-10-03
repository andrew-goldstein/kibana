/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RootWorkflowLineage } from '@kbn/workflows';
import { hasParentWorkflowExecution, hasRootWorkflowLineage } from '@kbn/workflows';

export interface ChildLineageParent {
  readonly context?: Record<string, unknown>;
  readonly id: string;
  readonly workflowId: string;
}

/**
 * Root lineage keys to spread into a child execution's context: the parent itself when it is top
 * level, else the parent's stored root, else nothing (a pre-upgrade child has no known root).
 */
export const buildChildLineageContext = ({
  context,
  id,
  workflowId,
}: ChildLineageParent): RootWorkflowLineage | Record<string, never> => {
  if (!hasParentWorkflowExecution(context)) {
    return { rootWorkflowExecutionId: id, rootWorkflowId: workflowId };
  }

  return hasRootWorkflowLineage(context)
    ? {
        rootWorkflowExecutionId: context.rootWorkflowExecutionId,
        rootWorkflowId: context.rootWorkflowId,
      }
    : {};
};
