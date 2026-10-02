/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDecisionSource, ProposalSettledBy } from '@kbn/proposals-common';
import type { ProposalProvenance } from '../storage/proposal_provenance';
import type { ProposalDocument } from '../storage/proposals_storage';
import type { ProposalsTelemetryEventType } from './constants';
import type { ProposalsTelemetryEventPayloads } from './event_types';

/**
 * What only the write in progress knows, and so is passed to telemetry rather than stored:
 * no later write reads any of these values back.
 */
export interface ProposalWriteContext {
  /** Whether the caller asked the gate to auto-approve, whatever the gate then decided. Creation only. */
  autoApproveRequested?: boolean;
  /** Who made the decision. Only on the write that records it. */
  decisionSource?: ProposalDecisionSource;
  /**
   * The settle path that moved the proposal to a terminal status without the loop recording an
   * outcome itself. Only on the write that settles it; absent when the loop settled it.
   */
  settledBy?: ProposalSettledBy;
}

/**
 * The proposal fields the payload builders read, plus its id: the stored record's public
 * fields, its storage-only provenance flattened, and the write-time context (see
 * `toTelemetryRecord`). `title` and `previousExecutionError` are caller free text and stay out
 * of this list.
 */
export type ProposalTelemetryRecord = { id: string } & Pick<
  ProposalDocument,
  | 'actionInput'
  | 'actionWorkflowId'
  | 'category'
  | 'comment'
  | 'confidence'
  | 'createdAt'
  | 'decidedAt'
  | 'decision'
  | 'dismissReason'
  | 'expiresAt'
  | 'impact'
  | 'origin'
  | 'revision'
  | 'rootProposalId'
  | 'spaceId'
  | 'status'
> &
  ProposalProvenance &
  ProposalWriteContext;

/** One event ready to report: its type and the payload that type carries. */
export type ProposalsTelemetryEvent = {
  [T in ProposalsTelemetryEventType]: { eventType: T; payload: ProposalsTelemetryEventPayloads[T] };
}[ProposalsTelemetryEventType];
