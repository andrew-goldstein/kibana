/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDecisionSource } from '@kbn/proposals-common';
import type { ProposalDocument } from '../storage/proposals_storage';
import type {
  ProposalRevisionSource,
  ProposalSettlePath,
  ProposalsTelemetryEventType,
} from './constants';
import type { ProposalsTelemetryEventPayloads } from './event_types';

/**
 * What only the write in progress knows, and so is passed to telemetry rather than stored:
 * no later write reads any of it back.
 */
export interface ProposalWriteContext {
  /**
   * The action as telemetry may name it, from the action read creation already makes. Creation
   * only: later events join to the `created` event by `root_proposal_id`.
   */
  actionId?: string;
  /** Who made the decision. Only on the write that records it. */
  decisionSource?: ProposalDecisionSource;
  /** Which surface asked for the revision. Only on the revision a `revise()` writes. */
  revisionSource?: ProposalRevisionSource;
  /** Which write settled the proposal outside the decision loop. Only on that write. */
  settlePath?: ProposalSettlePath;
}

/**
 * The proposal fields the payload builders read, plus its id: the stored record's public
 * fields and the write-time context (see `toTelemetryRecord`). `title` and `previousExecutionError` are caller free text and stay out
 * of this list.
 */
export type ProposalTelemetryRecord = { id: string } & Pick<
  ProposalDocument,
  | 'actionInput'
  | 'actionWorkflowId'
  | 'category'
  | 'comment'
  | 'confidence'
  | 'conversationId'
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
  | 'workflowExecutionId'
> &
  ProposalWriteContext;

/** One event ready to report: its type and the payload that type carries. */
export type ProposalsTelemetryEvent = {
  [T in ProposalsTelemetryEventType]: { eventType: T; payload: ProposalsTelemetryEventPayloads[T] };
}[ProposalsTelemetryEventType];
