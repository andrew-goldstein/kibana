/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { getUserFromRequest } from '../utils';
import { createClient } from './client';
import { ConversationServiceImpl } from './conversation_service';

jest.mock('../utils');
jest.mock('./client');

const getUserFromRequestMock = getUserFromRequest as jest.MockedFunction<typeof getUserFromRequest>;
const createClientMock = createClient as jest.MockedFunction<typeof createClient>;

const request = { headers: {} } as unknown as KibanaRequest;

// Distinct sentinels so tests can assert which scoped client each dependency receives.
const asCurrentUser = { name: 'as-current-user' } as never;
const asInternalUser = { name: 'as-internal-user' } as never;

const httpApiSource = { type: 'http_api' } as const;

const createConversationLifecycleMock = () => ({
  notifyCreated: jest.fn(),
  notifyMetadataUpdated: jest.fn(),
});

const createService = ({
  agents = {},
  attachments = { getTypeDefinition: jest.fn() },
  conversationLifecycle = createConversationLifecycleMock(),
  eventBus,
  spaces,
}: {
  agents?: object;
  attachments?: object;
  conversationLifecycle?: ReturnType<typeof createConversationLifecycleMock>;
  eventBus?: object;
  spaces?: object;
} = {}) => {
  return new ConversationServiceImpl({
    logger: loggingSystemMock.createLogger(),
    security: {} as never,
    elasticsearch: {
      client: {
        asScoped: jest.fn().mockReturnValue({ asCurrentUser, asInternalUser }),
      },
    } as never,
    agents: agents as never,
    conversationEvents: { getDefinition: jest.fn(), list: jest.fn().mockReturnValue([]) },
    conversationLifecycle,
    ...(eventBus ? { eventBus: eventBus as never } : {}),
    ...(spaces ? { spaces: spaces as never } : {}),
  });
};

describe('ConversationServiceImpl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserFromRequestMock.mockResolvedValue({ id: 'profile-1', username: 'jane', isAdmin: false });
  });

  describe('getScopedClient', () => {
    const agents = { getRegistry: jest.fn().mockResolvedValue({ id: 'registry' }) };

    it('wires the scoped event emitter to the event bus with the request', async () => {
      const eventBus = { emitMetadataPatched: jest.fn(), emitAttachmentEvents: jest.fn() };
      await createService({ agents, eventBus }).getScopedClient({ request, source: httpApiSource });

      const { eventEmitter } = createClientMock.mock.calls[0][0];
      const metadataPayload = { conversationId: 'conv-1', changedFields: ['x'] };
      const attachmentPayload = { conversationId: 'conv-1', events: [] };
      eventEmitter!.emitMetadataPatched(metadataPayload);
      eventEmitter!.emitAttachmentEvents(attachmentPayload);

      expect(eventBus.emitMetadataPatched).toHaveBeenCalledWith(request, metadataPayload);
      expect(eventBus.emitAttachmentEvents).toHaveBeenCalledWith(request, attachmentPayload);
    });

    it('leaves eventEmitter undefined without an event bus', async () => {
      await createService({ agents }).getScopedClient({ request, source: httpApiSource });

      expect(createClientMock.mock.calls[0][0].eventEmitter).toBeUndefined();
    });

    it.each([true, false])('passes isAdmin=%s through to the client', async (isAdmin) => {
      const user = { id: 'profile-1', username: 'jane', isAdmin };
      getUserFromRequestMock.mockResolvedValue(user);

      await createService({ agents }).getScopedClient({ request, source: httpApiSource });

      expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({ user }));
    });

    it('acts as the given user, without resolving the request identity', async () => {
      const owner = { id: 'profile-alice', username: 'alice', isAdmin: false };

      await createService({ agents }).getScopedClientAsUser({
        request,
        source: httpApiSource,
        user: owner,
      });

      expect(getUserFromRequestMock).not.toHaveBeenCalled();
      expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({ user: owner }));
    });

    it('uses the internal client for conversation storage', async () => {
      await createService({ agents }).getScopedClient({ request, source: httpApiSource });

      expect(createClientMock).toHaveBeenCalledWith(
        expect.objectContaining({ esClient: asInternalUser })
      );
      expect(getUserFromRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({ esClient: asCurrentUser })
      );
    });
  });

  describe('lifecycle source binding', () => {
    const agents = { getRegistry: jest.fn().mockResolvedValue({ id: 'registry' }) };
    const spaces = { spacesService: { getSpaceId: jest.fn().mockReturnValue('space-a') } };
    const notification = {
      changes: { status: { next: 'open' } },
      conversationId: 'conv-1',
      templateId: 'investigation',
    };

    it('binds the source and the space to the client lifecycle notifier', async () => {
      const conversationLifecycle = createConversationLifecycleMock();

      await createService({ agents, conversationLifecycle, spaces }).getScopedClient({
        request,
        source: httpApiSource,
      });

      const { lifecycleNotifier } = createClientMock.mock.calls[0][0];
      lifecycleNotifier?.notifyCreated(notification);

      expect(conversationLifecycle.notifyCreated).toHaveBeenCalledWith({
        ...notification,
        source: httpApiSource,
        spaceId: 'space-a',
      });
    });

    it('binds the source when acting as another user', async () => {
      const conversationLifecycle = createConversationLifecycleMock();
      const source = {
        isTestRun: false,
        type: 'workflow' as const,
        workflowExecutionId: 'exec-1',
        workflowId: 'wf-1',
      };

      await createService({ agents, conversationLifecycle, spaces }).getScopedClientAsUser({
        request,
        source,
        user: { id: 'profile-alice', isAdmin: false, username: 'alice' },
      });

      const { lifecycleNotifier } = createClientMock.mock.calls[0][0];
      lifecycleNotifier?.notifyMetadataUpdated(notification);

      expect(conversationLifecycle.notifyMetadataUpdated).toHaveBeenCalledWith({
        ...notification,
        source,
        spaceId: 'space-a',
      });
    });

    it('binds each client to its own source', async () => {
      const conversationLifecycle = createConversationLifecycleMock();
      const service = createService({ agents, conversationLifecycle, spaces });

      await service.getScopedClient({ request, source: { type: 'execution' } });
      await service.getScopedClient({ request, source: { type: 'server_api' } });

      createClientMock.mock.calls[1][0].lifecycleNotifier?.notifyCreated(notification);
      createClientMock.mock.calls[0][0].lifecycleNotifier?.notifyCreated(notification);

      expect(conversationLifecycle.notifyCreated.mock.calls.map(([event]) => event.source)).toEqual(
        [{ type: 'server_api' }, { type: 'execution' }]
      );
    });
  });
});
