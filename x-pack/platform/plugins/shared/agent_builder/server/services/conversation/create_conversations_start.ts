/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationsStart } from '@kbn/agent-builder-server';
import type { AgentsServiceStart } from '../agents';
import type { ConversationService } from './conversation_service';
import { createConversationPublicClient } from './conversation_public_client';

/** Builds the conversations start contract; other plugins' writes are attributed to `server_api`. */
export const createConversationsStart = ({
  agents,
  conversations,
}: {
  agents: AgentsServiceStart;
  conversations: ConversationService;
}): ConversationsStart => ({
  getScopedClient: async ({ request }) => {
    const [client, agentRegistry] = await Promise.all([
      conversations.getScopedClient({ request, source: { type: 'server_api' } }),
      agents.getRegistry({ request }),
    ]);
    return createConversationPublicClient({ agentRegistry, client });
  },
});
