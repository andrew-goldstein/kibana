/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConversationLifecycleCreatedEvent,
  ConversationLifecycleMetadataUpdatedEvent,
  ConversationLifecycleSetup,
  ConversationLifecycleSource,
} from '@kbn/agent-builder-server';

export type ConversationLifecycleServiceSetup = ConversationLifecycleSetup;

/**
 * Delivers lifecycle events to the subscribed listeners. Callers pass every changed field; each
 * listener receives only its subscribed ones. Never throws and never waits for listeners.
 */
export interface ConversationLifecycleServiceStart {
  notifyCreated(event: ConversationLifecycleCreatedEvent): void;
  notifyMetadataUpdated(event: ConversationLifecycleMetadataUpdatedEvent): void;
}

/** A lifecycle event as the conversation client reports it, before its bound source and space are added. */
export type ConversationLifecycleNotification = Omit<
  ConversationLifecycleCreatedEvent,
  'source' | 'spaceId'
>;

/** What a scoped conversation client is bound to when it is constructed. */
export interface ConversationLifecycleScope {
  source: ConversationLifecycleSource;
  spaceId: string;
}

/**
 * Per-client notifier handed to the conversation client. Pre-binds the client's source and space
 * so the client cannot report a different one.
 */
export interface ScopedConversationLifecycleNotifier {
  notifyCreated(notification: ConversationLifecycleNotification): void;
  notifyMetadataUpdated(notification: ConversationLifecycleNotification): void;
}
