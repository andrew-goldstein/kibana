/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER } from '@kbn/workflows-extensions/server';
import { getWorkflowRequestExecutionId } from '.';

const EXECUTION_ID = '3f2c9e1a-7b4d-4c8e-9a1f-2d3e4f5a6b7c';
const INTERNAL_ORIGIN = { 'x-elastic-internal-origin': 'Kibana' };

const createRequest = (headers: Record<string, string>) =>
  httpServerMock.createKibanaRequest({ headers });

describe('getWorkflowRequestExecutionId', () => {
  it('returns the execution id for a workflow request with the internal origin', () => {
    const request = createRequest({
      ...INTERNAL_ORIGIN,
      [EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER]: EXECUTION_ID,
    });

    const result = getWorkflowRequestExecutionId(request);

    expect(result).toEqual({ workflowExecutionId: EXECUTION_ID });
  });

  it('marks the request as a workflow request but drops an execution id that is not a UUID', () => {
    const request = createRequest({
      ...INTERNAL_ORIGIN,
      [EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER]: 'free text that must never ship',
    });

    const result = getWorkflowRequestExecutionId(request);

    expect(result).toEqual({ workflowExecutionId: undefined });
  });

  it('returns undefined without the internal origin, even with the execution id header', () => {
    const request = createRequest({ [EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER]: EXECUTION_ID });

    const result = getWorkflowRequestExecutionId(request);

    expect(result).toBeUndefined();
  });

  it('returns undefined for an internal request without the execution id header', () => {
    const request = createRequest(INTERNAL_ORIGIN);

    const result = getWorkflowRequestExecutionId(request);

    expect(result).toBeUndefined();
  });
});
