/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConversationLifecycleScope,
  ConversationLifecycleServiceStart,
  ScopedConversationLifecycleNotifier,
} from './types';

/** Binds a conversation client's source and space to the lifecycle events it reports. */
export const createScopedConversationLifecycleNotifier = (
  lifecycle: ConversationLifecycleServiceStart,
  { source, spaceId }: ConversationLifecycleScope
): ScopedConversationLifecycleNotifier => ({
  notifyCreated: (notification) => lifecycle.notifyCreated({ ...notification, source, spaceId }),
  notifyMetadataUpdated: (notification) =>
    lifecycle.notifyMetadataUpdated({ ...notification, source, spaceId }),
});
