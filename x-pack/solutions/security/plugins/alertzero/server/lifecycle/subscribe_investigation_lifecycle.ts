/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationLifecycleSetup } from '@kbn/agent-builder-server';
import { INVESTIGATION_LIFECYCLE_FILTER } from './constants';
import type { CreateInvestigationLifecycleListenersParams } from './create_investigation_lifecycle_listeners';
import { createInvestigationLifecycleListeners } from './create_investigation_lifecycle_listeners';

export interface InvestigationLifecycleSubscription {
  /** Agent Builder has no unsubscribe, so this makes the registered listeners no-ops. */
  stop: () => void;
}

/**
 * Subscribes AlertZero's Investigation telemetry to the Agent Builder conversation lifecycle.
 * Call during setup; the listeners report through `reporter` once events arrive.
 */
export const subscribeInvestigationLifecycle = ({
  conversationLifecycle,
  ...params
}: CreateInvestigationLifecycleListenersParams & {
  conversationLifecycle: ConversationLifecycleSetup;
}): InvestigationLifecycleSubscription => {
  const { onCreated, onMetadataUpdated, stop } = createInvestigationLifecycleListeners(params);

  conversationLifecycle.onCreated(INVESTIGATION_LIFECYCLE_FILTER, onCreated);
  conversationLifecycle.onMetadataUpdated(INVESTIGATION_LIFECYCLE_FILTER, onMetadataUpdated);

  return { stop };
};
