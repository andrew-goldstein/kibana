/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SYSTEM_SECURITY_WORKER_IDS } from '@kbn/alertzero-common';
import type { WorkerChainExecution, WorkerChainVerification } from './worker_chain_execution';

const isCatalogWorkerId = (id: string | null | undefined): boolean =>
  id != null && (SYSTEM_SECURITY_WORKER_IDS as readonly string[]).includes(id);

/**
 * Verifies that a chain's root execution is a catalog Worker, keeping only the fields the envelope
 * reads so the result does not hold a whole workflow definition.
 */
export const verifyCatalogRoot = ({
  context,
  id,
  originManagedWorkflowId,
  spaceId,
  triggeredBy,
  workflowDefinition,
}: WorkerChainExecution): WorkerChainVerification =>
  isCatalogWorkerId(originManagedWorkflowId)
    ? {
        root: {
          context,
          id,
          originManagedWorkflowId,
          spaceId,
          triggeredBy,
          workflowDefinition: { consts: workflowDefinition?.consts },
        },
        verified: true,
      }
    : { reason: 'not_catalog_root', verified: false };
