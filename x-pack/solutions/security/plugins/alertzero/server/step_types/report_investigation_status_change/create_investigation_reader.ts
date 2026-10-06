/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { ConversationsStart } from '@kbn/agent-builder-server';
import type { InvestigationConversation } from './read_investigation_status';

/** Reads one conversation, without its rounds, as the run; `undefined` when it is not visible. */
export type InvestigationReader = (
  request: KibanaRequest,
  investigationId: string
) => Promise<InvestigationConversation | undefined>;

/** Reads through Agent Builder's scoped conversation client, so the run's own access applies. */
export const createInvestigationReader =
  (getConversations: () => Pick<ConversationsStart, 'getScopedClient'>): InvestigationReader =>
  async (request, investigationId) => {
    const client = await getConversations().getScopedClient({ request });
    const conversations = await client.bulkGet([investigationId]);
    return conversations.get(investigationId);
  };
