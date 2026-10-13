/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalFailureSource, ProposalSettlePath } from './constants';

/**
 * Why a write failed a proposal, from which settle path wrote it: none for the action's own
 * outcome, the gate's workflow-level failure handler, or a read or decision that found the gate
 * execution ended.
 */
export const toFailureSource = (settlePath?: ProposalSettlePath): ProposalFailureSource => {
  if (settlePath === undefined) {
    return 'action';
  }
  return settlePath === 'gate_ended' ? 'gate_ended' : 'workflow_failure';
};
