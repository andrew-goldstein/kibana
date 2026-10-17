/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ATTACK_DISCOVERY_EVENT_LOG_ACTION_GENERATION_STARTED } from '@kbn/discoveries/impl/attack_discovery/persistence/event_logging';

interface EventLogHit {
  _source?: unknown;
}

interface EventSource {
  event?: {
    action?: unknown;
    id?: unknown;
  };
}

const getGenerationStartedEventId = ({ _source }: EventLogHit): string | undefined => {
  const { event } = (_source ?? {}) as EventSource;

  if (event?.action !== ATTACK_DISCOVERY_EVENT_LOG_ACTION_GENERATION_STARTED) {
    return undefined;
  }

  return typeof event.id === 'string' && event.id.length > 0 ? event.id : undefined;
};

/**
 * Returns the `event.id` of the most recent `generation-started` event, which only a
 * pipeline-backed generation sets (to the pipeline's own workflow execution id).
 */
export const getPipelineRunId = (hits: EventLogHit[]): string | undefined =>
  hits.map(getGenerationStartedEventId).find((eventId) => eventId != null);
