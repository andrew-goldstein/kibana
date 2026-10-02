/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalsCallerFields } from './event_types';
import { isDefaultSpace } from './is_default_space';
import type { ProposalTelemetryRecord } from './types';

/**
 * The caller fields every per-proposal event carries: the origin the caller declared, whether
 * the server verified the calling run as managed, its run id, and the space flag.
 */
export const buildCallerFields = ({
  callerManaged,
  callerRunId,
  origin,
  spaceId,
}: Pick<
  ProposalTelemetryRecord,
  'callerManaged' | 'callerRunId' | 'origin' | 'spaceId'
>): ProposalsCallerFields => ({
  ...(callerRunId ? { caller_run_id: callerRunId } : {}),
  is_default_space: isDefaultSpace(spaceId),
  managed_caller: callerManaged === true,
  origin,
});
