/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SYSTEM_SECURITY_WORKER_CATALOG } from '@kbn/alertzero-common';
import { ATTACK_DISCOVERY_WORKFLOW_GENERATION_SOURCE_PREFIX } from '@kbn/elastic-assistant-common';

/**
 * Returns the AlertZero Worker id when an attack's `generation_source` names the Worker's
 * workflow: the Worker id, or the per-space `<worker id>-<space id>` that earlier builds recorded.
 */
export const getGenerationSourceWorkerId = ({
  generationSource,
  spaceId,
}: {
  generationSource: string | undefined;
  spaceId: string | undefined;
}): string | undefined => {
  if (!generationSource?.startsWith(ATTACK_DISCOVERY_WORKFLOW_GENERATION_SOURCE_PREFIX)) {
    return undefined;
  }

  const workflowId = generationSource.slice(
    ATTACK_DISCOVERY_WORKFLOW_GENERATION_SOURCE_PREFIX.length
  );

  return SYSTEM_SECURITY_WORKER_CATALOG.find(
    ({ id }) => workflowId === id || (spaceId != null && workflowId === `${id}-${spaceId}`)
  )?.id;
};
