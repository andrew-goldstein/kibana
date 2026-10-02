/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Why a decision attempt (a gate release) was refused, when a conflict is that refusal. */
export type ProposalResumeConflictReason =
  | 'already_decided'
  | 'input_changed'
  | 'no_execution'
  | 'not_waiting'
  | 'settled';

/**
 * Thrown when the proposal can no longer be decided: someone else decided
 * first, the execution already moved on, or the concurrency guard lost.
 *
 * `reason` is set only where a gate release is refused, so telemetry can tell
 * a refusal from a lost write race; the routes and steps still map on the
 * class alone.
 */
export class ProposalConflictError extends Error {
  readonly reason?: ProposalResumeConflictReason;

  constructor(message: string, { reason }: { reason?: ProposalResumeConflictReason } = {}) {
    super(message);
    this.name = 'ProposalConflictError';
    this.reason = reason;
  }
}
