/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalsCallerFields } from './event_types';
import { isDefaultSpace } from './is_default_space';
import { resolveProposalConsumer } from './resolve_proposal_consumer';
import type { ProposalTelemetryRecord } from './types';

/** The caller fields every per-proposal event carries, from the stored provenance. */
export const buildCallerFields = ({
  callerManagedBy,
  callerRunId,
  spaceId,
}: Pick<
  ProposalTelemetryRecord,
  'callerManagedBy' | 'callerRunId' | 'spaceId'
>): ProposalsCallerFields => ({
  ...resolveProposalConsumer(callerManagedBy),
  ...(callerRunId ? { caller_run_id: callerRunId } : {}),
  is_default_space: isDefaultSpace(spaceId),
});
