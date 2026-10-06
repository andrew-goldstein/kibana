/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { getEmitterWorkflowExecutionIdFromRequest } from '@kbn/workflows-extensions/server';
import { validate as uuidValidate } from 'uuid';

export interface WorkflowRequestOrigin {
  /** The calling workflow run's id; absent when the header value is not a UUID. */
  workflowExecutionId: string | undefined;
}

/**
 * Whether a request came from a workflow's `kibana.request` step, which marks its calls with the
 * internal-origin header and its run's execution id. Both headers can be set by any caller, so the
 * result labels telemetry only and must never be used for authorization. Returns `undefined` for
 * any other caller.
 */
export const getWorkflowRequestExecutionId = (
  request: KibanaRequest
): WorkflowRequestOrigin | undefined => {
  if (!request.isInternalApiRequest) {
    return undefined;
  }

  const executionId = getEmitterWorkflowExecutionIdFromRequest(request);
  if (executionId === undefined) {
    return undefined;
  }

  return { workflowExecutionId: uuidValidate(executionId) ? executionId : undefined };
};
