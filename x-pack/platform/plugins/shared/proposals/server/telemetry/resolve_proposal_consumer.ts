/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CUSTOM_CONSUMER } from './constants';
import type { ProposalsCallerFields } from './event_types';

/**
 * Resolves `consumer` and `managed_caller` from the calling workflow's persisted `managedBy`:
 * the owning plugin for a managed caller, else `custom`.
 */
export const resolveProposalConsumer = (
  callerManagedBy: string | undefined
): Pick<ProposalsCallerFields, 'consumer' | 'managed_caller'> =>
  callerManagedBy
    ? { consumer: callerManagedBy, managed_caller: true }
    : { consumer: CUSTOM_CONSUMER, managed_caller: false };
