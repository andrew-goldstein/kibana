/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalsCommonFields } from './event_types';
import { isDefaultSpace } from './is_default_space';
import type { ProposalTelemetryRecord } from './types';

/**
 * The fields every proposals event carries: the origin the caller declared, the space flag, and
 * the gate execution the proposal was created in, which joins to the Workflows engine's run
 * events.
 */
export const buildCommonFields = ({
  origin,
  spaceId,
  workflowExecutionId,
}: Pick<
  ProposalTelemetryRecord,
  'origin' | 'spaceId' | 'workflowExecutionId'
>): ProposalsCommonFields => ({
  is_default_space: isDefaultSpace(spaceId),
  origin,
  ...(workflowExecutionId ? { workflow_execution_id: workflowExecutionId } : {}),
});
