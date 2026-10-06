/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** True when the context belongs to an execution started by a parent workflow step. */
export const hasParentWorkflowExecution = (
  context: Record<string, unknown> | undefined
): context is Record<string, unknown> & { parentWorkflowExecutionId: string } =>
  typeof context?.parentWorkflowExecutionId === 'string';

/** True when the context carries the root execution id of its sub-workflow chain as a string. */
export const hasRootWorkflowExecutionId = (
  context: Record<string, unknown> | undefined
): context is Record<string, unknown> & { rootWorkflowExecutionId: string } =>
  typeof context?.rootWorkflowExecutionId === 'string';
