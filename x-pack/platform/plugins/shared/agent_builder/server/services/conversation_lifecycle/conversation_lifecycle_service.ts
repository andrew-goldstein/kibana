/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type {
  ConversationLifecycleCreatedEvent,
  ConversationLifecycleFilter,
  ConversationLifecycleMetadataUpdatedEvent,
} from '@kbn/agent-builder-server';
import { projectLifecycleChanges } from './project_lifecycle_changes';
import type { ConversationLifecycleServiceSetup, ConversationLifecycleServiceStart } from './types';

type LifecycleEventKind = 'created' | 'metadata_updated';

type LifecycleEvent = ConversationLifecycleCreatedEvent | ConversationLifecycleMetadataUpdatedEvent;

interface Subscription {
  fields: readonly string[];
  kind: LifecycleEventKind;
  listener: (event: LifecycleEvent) => unknown;
  templateIds: ReadonlySet<string>;
}

export interface ConversationLifecycleService {
  setup: () => ConversationLifecycleServiceSetup;
  start: () => ConversationLifecycleServiceStart;
}

const toSubscription = (
  kind: LifecycleEventKind,
  { fields, templateIds }: ConversationLifecycleFilter,
  listener: (event: LifecycleEvent) => unknown
): Subscription => {
  if (templateIds.length === 0) {
    throw new Error(`A conversation lifecycle "${kind}" filter must list at least one template id`);
  }
  // Copied so later changes to the caller's arrays cannot widen the subscription.
  return { fields: [...fields], kind, listener, templateIds: new Set(templateIds) };
};

/** Creates the registry of conversation lifecycle listeners and their non-blocking dispatcher. */
export const createConversationLifecycleService = ({
  logger,
}: {
  logger: Logger;
}): ConversationLifecycleService => {
  let subscriptions: readonly Subscription[] = [];

  const subscribe = (subscription: Subscription): void => {
    subscriptions = [...subscriptions, subscription];
  };

  const deliver = (
    { fields, kind, listener }: Subscription,
    event: LifecycleEvent,
    { skipWhenUnchanged }: { skipWhenUnchanged: boolean }
  ): void => {
    // A single chain covers sync throws and async rejections: listener failures never reach the
    // writer and never become unhandled rejections.
    void Promise.resolve()
      .then(() => {
        const changes = projectLifecycleChanges(event.changes, fields);
        if (skipWhenUnchanged && Object.keys(changes).length === 0) {
          return;
        }
        return listener({ ...event, changes, source: { ...event.source } });
      })
      .catch((error) => {
        logger.warn(
          `Conversation lifecycle "${kind}" listener failed for conversation "${event.conversationId}": ${error}`
        );
      });
  };

  const dispatch = (kind: LifecycleEventKind, event: LifecycleEvent): void => {
    subscriptions
      .filter(
        (subscription) =>
          subscription.kind === kind && subscription.templateIds.has(event.templateId)
      )
      .forEach((subscription) =>
        deliver(subscription, event, { skipWhenUnchanged: kind === 'metadata_updated' })
      );
  };

  return {
    setup: () => ({
      onCreated: (filter, listener) => subscribe(toSubscription('created', filter, listener)),
      onMetadataUpdated: (filter, listener) =>
        subscribe(toSubscription('metadata_updated', filter, listener)),
    }),
    start: () => ({
      notifyCreated: (event) => dispatch('created', event),
      notifyMetadataUpdated: (event) => dispatch('metadata_updated', event),
    }),
  };
};
