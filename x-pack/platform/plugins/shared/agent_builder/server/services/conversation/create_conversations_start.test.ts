/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { createConversationServiceMock } from '../../test_utils/conversations';
import { createConversationPublicClient } from './conversation_public_client';
import { createConversationsStart } from './create_conversations_start';

jest.mock('./conversation_public_client');

const createConversationPublicClientMock = jest.mocked(createConversationPublicClient);

describe('createConversationsStart', () => {
  const agentRegistry = { id: 'agent-registry' };

  const setup = () => {
    const conversations = createConversationServiceMock();
    const agents = { getRegistry: jest.fn().mockResolvedValue(agentRegistry) };
    const start = createConversationsStart({ agents: agents as never, conversations });
    return { agents, conversations, start };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds the conversation client with the server_api source', async () => {
    const { conversations, start } = setup();
    const request = httpServerMock.createKibanaRequest();

    await start.getScopedClient({ request });

    expect(conversations.getScopedClient).toHaveBeenCalledWith({
      request,
      source: { type: 'server_api' },
    });
  });

  it('ignores a source smuggled in by the caller', async () => {
    const { conversations, start } = setup();
    const request = httpServerMock.createKibanaRequest();

    await start.getScopedClient({ request, source: { type: 'http_api' } } as never);

    expect(conversations.getScopedClient).toHaveBeenCalledWith({
      request,
      source: { type: 'server_api' },
    });
  });

  it('wraps the scoped client in the public client', async () => {
    const { agents, conversations, start } = setup();
    const request = httpServerMock.createKibanaRequest();
    const publicClient = { get: jest.fn() };
    createConversationPublicClientMock.mockReturnValue(publicClient as never);

    const result = await start.getScopedClient({ request });

    expect(agents.getRegistry).toHaveBeenCalledWith({ request });
    expect(createConversationPublicClientMock).toHaveBeenCalledWith({
      agentRegistry,
      client: await conversations.getScopedClient.mock.results[0].value,
    });
    expect(result).toBe(publicClient);
  });
});
