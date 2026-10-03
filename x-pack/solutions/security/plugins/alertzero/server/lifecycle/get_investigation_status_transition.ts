/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationLifecycleChanges } from '@kbn/agent-builder-server';
import { INVESTIGATION_STATUS_FIELD } from './constants';

export type InvestigationStatusTransition = 'closed' | 'reopened';

/**
 * Reads the status transition a write made: `closed` when the status became `closed`,
 * `reopened` when it went from `closed` back to `open`, and nothing otherwise.
 */
export const getInvestigationStatusTransition = (
  changes: ConversationLifecycleChanges
): InvestigationStatusTransition | undefined => {
  const { next, previous } = changes[INVESTIGATION_STATUS_FIELD] ?? {};

  if (next === 'closed') {
    return 'closed';
  }
  if (previous === 'closed' && next === 'open') {
    return 'reopened';
  }
  return undefined;
};
