/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { createInvestigationReader } from './create_investigation_reader';

const INVESTIGATION_ID = '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f';

const setup = (found: Map<string, unknown>) => {
  const bulkGet = jest.fn().mockResolvedValue(found);
  const getScopedClient = jest.fn().mockResolvedValue({ bulkGet });
  const read = createInvestigationReader(() => ({ getScopedClient } as never));
  return { bulkGet, getScopedClient, read };
};

describe('createInvestigationReader', () => {
  it('reads the conversation without its rounds, as the run', async () => {
    const conversation = { metadata: { status: 'closed' }, template_id: 'investigation' };
    const { bulkGet, getScopedClient, read } = setup(new Map([[INVESTIGATION_ID, conversation]]));
    const request = httpServerMock.createKibanaRequest();

    const result = await read(request, INVESTIGATION_ID);

    expect({
      bulkGet: bulkGet.mock.calls,
      getScopedClient: getScopedClient.mock.calls,
      result,
    }).toEqual({
      bulkGet: [[[INVESTIGATION_ID]]],
      getScopedClient: [[{ request }]],
      result: conversation,
    });
  });

  it('returns undefined for a conversation the run cannot see', async () => {
    const { read } = setup(new Map());

    expect(await read(httpServerMock.createKibanaRequest(), INVESTIGATION_ID)).toBeUndefined();
  });
});
