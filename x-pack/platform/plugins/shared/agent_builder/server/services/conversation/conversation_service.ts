/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  KibanaRequest,
  Logger,
  SecurityServiceStart,
  ElasticsearchServiceStart,
} from '@kbn/core/server';
import type { CurrentUser } from '@kbn/agent-builder-common';
import type { ConversationLifecycleSource } from '@kbn/agent-builder-server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import { getUserFromRequest } from '../utils';
import { getCurrentSpaceId } from '../../utils/spaces';
import type { AgentsServiceStart } from '../agents';
import type { ConversationClient } from './client';
import { createClient } from './client';
import type { ConversationEventBus } from '../../workflows/triggers/conversation_event_bus';
import { createScopedConversationEventEmitter } from '../../workflows/triggers/conversation_event_bus';
import type { ConversationEventsServiceStart } from '../conversation_events';
import {
  createScopedConversationLifecycleNotifier,
  type ConversationLifecycleServiceStart,
} from '../conversation_lifecycle';

export interface ConversationService {
  /**
   * Returns a client acting as the request's user. `source` is bound to the client and reported
   * on the lifecycle events of its writes.
   */
  getScopedClient(options: {
    request: KibanaRequest;
    source: ConversationLifecycleSource;
  }): Promise<ConversationClient>;
  /** Same as {@link ConversationService.getScopedClient}, acting as the given user. */
  getScopedClientAsUser(options: {
    request: KibanaRequest;
    source: ConversationLifecycleSource;
    user: CurrentUser;
  }): Promise<ConversationClient>;
}

interface ConversationServiceDeps {
  logger: Logger;
  security: SecurityServiceStart;
  elasticsearch: ElasticsearchServiceStart;
  spaces?: SpacesPluginStart;
  agents: AgentsServiceStart;
  eventBus?: ConversationEventBus;
  conversationEvents: ConversationEventsServiceStart;
  conversationLifecycle: ConversationLifecycleServiceStart;
}

export class ConversationServiceImpl implements ConversationService {
  private readonly logger: Logger;
  private readonly security: SecurityServiceStart;
  private readonly elasticsearch: ElasticsearchServiceStart;
  private readonly spaces?: SpacesPluginStart;
  private readonly agents: AgentsServiceStart;
  private readonly eventBus?: ConversationEventBus;
  private readonly conversationEvents: ConversationEventsServiceStart;
  private readonly conversationLifecycle: ConversationLifecycleServiceStart;

  constructor({
    logger,
    security,
    elasticsearch,
    spaces,
    agents,
    eventBus,
    conversationEvents,
    conversationLifecycle,
  }: ConversationServiceDeps) {
    this.logger = logger;
    this.security = security;
    this.elasticsearch = elasticsearch;
    this.spaces = spaces;
    this.agents = agents;
    this.eventBus = eventBus;
    this.conversationEvents = conversationEvents;
    this.conversationLifecycle = conversationLifecycle;
  }

  async getScopedClient({
    request,
    source,
  }: {
    request: KibanaRequest;
    source: ConversationLifecycleSource;
  }): Promise<ConversationClient> {
    const user = await getUserFromRequest({
      request,
      security: this.security,
      esClient: this.getScopedEsClient(request).asCurrentUser,
    });

    return this.createScopedClient({ request, source, user });
  }

  async getScopedClientAsUser({
    request,
    source,
    user,
  }: {
    request: KibanaRequest;
    source: ConversationLifecycleSource;
    user: CurrentUser;
  }): Promise<ConversationClient> {
    return this.createScopedClient({ request, source, user });
  }

  private async createScopedClient({
    request,
    source,
    user,
  }: {
    request: KibanaRequest;
    source: ConversationLifecycleSource;
    user: CurrentUser;
  }): Promise<ConversationClient> {
    const esClient = this.getScopedEsClient(request).asInternalUser;
    const space = getCurrentSpaceId({ request, spaces: this.spaces });
    const agentRegistry = await this.agents.getRegistry({ request });
    const eventBus = this.eventBus;

    return createClient({
      user,
      esClient,
      logger: this.logger,
      space,
      agentRegistry,
      conversationEvents: this.conversationEvents,
      eventEmitter: eventBus ? createScopedConversationEventEmitter(eventBus, request) : undefined,
      lifecycleNotifier: createScopedConversationLifecycleNotifier(this.conversationLifecycle, {
        source,
        spaceId: space,
      }),
    });
  }

  private getScopedEsClient(request: KibanaRequest) {
    return this.elasticsearch.client.asScoped(request);
  }
}
