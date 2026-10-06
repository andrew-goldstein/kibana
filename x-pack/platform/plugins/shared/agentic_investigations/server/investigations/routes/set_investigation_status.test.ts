/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { httpServerMock, httpServiceMock } from '@kbn/core-http-server-mocks';
import type { RequestHandler } from '@kbn/core/server';
import { EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER } from '@kbn/workflows-extensions/server';
import type { InvestigationRouteDependencies } from '../types';
import { registerSetInvestigationStatusRoute } from './set_investigation_status';

const INVESTIGATION_ID = '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f';
const EXECUTION_ID = '3f2c9e1a-7b4d-4c8e-9a1f-2d3e4f5a6b7c';
const INTERNAL_ORIGIN = { 'x-elastic-internal-origin': 'Kibana' };

const register = () => {
  const router = httpServiceMock.createRouter();
  const addVersion = jest.fn();
  (router.versioned.put as jest.Mock).mockReturnValue({ addVersion });
  const setStatus = jest.fn().mockResolvedValue({
    conversation_id: INVESTIGATION_ID,
    dismissed_proposal_ids: [],
    failed_proposal_ids: [],
    status: 'closed',
  });

  registerSetInvestigationStatusRoute({
    router,
    logger: loggingSystemMock.createLogger(),
    getInvestigationStatusService: () => ({ setStatus }),
  } as unknown as InvestigationRouteDependencies);

  const handler: RequestHandler = addVersion.mock.calls[0][1];

  const call = async (headers: Record<string, string>, body: Record<string, unknown>) => {
    const request = httpServerMock.createKibanaRequest({
      body,
      headers,
      params: { id: INVESTIGATION_ID },
    });
    await handler({} as never, request, httpServerMock.createResponseFactory());
  };

  return { call, setStatus };
};

describe('registerSetInvestigationStatusRoute telemetry options', () => {
  it('passes no telemetry options for a request without workflow headers', async () => {
    const { call, setStatus } = register();

    await call({}, { status: 'closed' });

    expect(setStatus.mock.calls[0][3]).toEqual({});
  });

  it('ignores telemetry classes sent in the request body', async () => {
    const { call, setStatus } = register();

    await call(
      {},
      {
        closedBy: 'escalation_cascade',
        reopenedBy: 'workflow_step',
        status: 'closed',
        workflowExecutionId: EXECUTION_ID,
      }
    );

    expect(setStatus.mock.calls[0][3]).toEqual({});
  });

  it('labels a workflow kibana.request call as workflow_request with its run id', async () => {
    const { call, setStatus } = register();

    await call(
      { ...INTERNAL_ORIGIN, [EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER]: EXECUTION_ID },
      { status: 'closed' }
    );

    expect(setStatus.mock.calls[0][3]).toEqual({
      closedBy: 'workflow_request',
      reopenedBy: 'workflow_request',
      workflowExecutionId: EXECUTION_ID,
    });
  });

  it('labels a workflow call but drops a run id that is not a UUID', async () => {
    const { call, setStatus } = register();

    await call(
      { ...INTERNAL_ORIGIN, [EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER]: 'not a uuid' },
      { status: 'closed' }
    );

    expect(setStatus.mock.calls[0][3]).toEqual({
      closedBy: 'workflow_request',
      reopenedBy: 'workflow_request',
      workflowExecutionId: undefined,
    });
  });

  it('does not label a call with the run id header but no internal origin', async () => {
    const { call, setStatus } = register();

    await call({ [EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER]: EXECUTION_ID }, { status: 'closed' });

    expect(setStatus.mock.calls[0][3]).toEqual({});
  });
});
