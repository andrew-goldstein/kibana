/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ATTACK_DISCOVERY_WORKFLOW_GENERATION_SOURCE_PREFIX } from '@kbn/elastic-assistant-common';
import type { WorkflowExecutionContext } from '@kbn/workflows';

/**
 * Returns the producer of an execution that inherited a service account: the definition id of the
 * workflow that owns the account, prefixed with `workflow:`. A managed workflow installed per space
 * has the id `<definition id>-<space id>`, so the space suffix is dropped and every space reports the
 * same producer. Returns `undefined` for every other execution.
 */
export const getIdentityGenerationSource = ({
  effectiveIdentity,
  spaceId,
}: {
  effectiveIdentity: WorkflowExecutionContext['effectiveIdentity'];
  spaceId: string;
}): string | undefined => {
  if (effectiveIdentity?.type !== 'service_account' || effectiveIdentity.inheritedFrom == null) {
    return undefined;
  }

  const { workloadId } = effectiveIdentity.inheritedFrom;
  const spaceSuffix = `-${spaceId}`;
  const definitionId = workloadId.endsWith(spaceSuffix)
    ? workloadId.slice(0, -spaceSuffix.length)
    : workloadId;

  return `${ATTACK_DISCOVERY_WORKFLOW_GENERATION_SOURCE_PREFIX}${definitionId}`;
};
