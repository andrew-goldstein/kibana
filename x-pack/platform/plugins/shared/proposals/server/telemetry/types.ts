/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDocument } from '../storage/proposals_storage';
import type { ProposalsTelemetryEventType } from './constants';
import type { ProposalsTelemetryEventPayloads } from './event_types';

/**
 * The stored proposal fields the payload builders read, plus its id. The service passes its
 * stored record, including the storage-only provenance, never the stripped public proposal.
 */
export type ProposalTelemetryRecord = { id: string } & Pick<
  ProposalDocument,
  | 'actionId'
  | 'actionInput'
  | 'actionWorkflowId'
  | 'attempt'
  | 'autoApproveRequested'
  | 'callerManagedBy'
  | 'callerRunId'
  | 'category'
  | 'comment'
  | 'confidence'
  | 'createdAt'
  | 'decidedAt'
  | 'decision'
  | 'decisionSource'
  | 'dismissReason'
  | 'expiresAt'
  | 'impact'
  | 'revision'
  | 'rootProposalId'
  | 'settledBy'
  | 'spaceId'
  | 'status'
>;

/** One event ready to report: its type and the payload that type carries. */
export type ProposalsTelemetryEvent = {
  [T in ProposalsTelemetryEventType]: { eventType: T; payload: ProposalsTelemetryEventPayloads[T] };
}[ProposalsTelemetryEventType];
