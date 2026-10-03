/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalDecisionSource, ProposalSettledBy } from '@kbn/proposals-common';

/**
 * Where a proposal came from and how it settled, for reporting only.
 *
 * Storage-only, like the sort ranks: written by the service and stripped
 * before a proposal leaves it, so none of it reaches the API contract, the
 * conversation attachment or a workflow step's output. Every field is optional
 * because records written before these existed carry none of them, and a
 * proposal created outside the gate has no caller.
 */
export interface ProposalProvenance {
  /**
   * The action as telemetry may name it: the action workflow's managed
   * definition id, or `custom` for a workflow no plugin manages, never the
   * workflow's own id. Resolved once, from the action read creation already
   * makes, so later events never read the action again. A retry and a
   * revision inherit it with the action itself. Absent without an action, when
   * the action could not be read at creation, and on older records.
   */
  actionId?: string;
  /**
   * The clone generation: 1 for the first attempt, one more for each retry of
   * a failed action. A revision inherits it. Absent on older records, which
   * read as 1.
   */
  attempt?: number;
  /** Whether the caller asked the gate to auto-approve, whatever the gate then decided. */
  autoApproveRequested?: boolean;
  /** The plugin that manages the calling workflow; absent for one nobody manages, and for a test run. */
  callerManagedBy?: string;
  /**
   * The root execution of the calling workflow's run, found by walking its
   * persisted parents. Best-effort: absent when any ancestor is unreadable.
   */
  callerRunId?: string;
  /** The workflow execution that called the gate. */
  callerWorkflowExecutionId?: string;
  /** The workflow that called the gate. */
  callerWorkflowId?: string;
  /** Who made the decision; written with the decision and never moved. */
  decisionSource?: ProposalDecisionSource;
  /**
   * The settle path that moved the proposal to a terminal status without the
   * loop recording an outcome itself. Absent when the loop settled it.
   */
  settledBy?: ProposalSettledBy;
}

/** What the gate knows about its caller when it creates a proposal. */
export type ProposalCallerProvenance = Pick<
  ProposalProvenance,
  'callerManagedBy' | 'callerRunId' | 'callerWorkflowExecutionId' | 'callerWorkflowId'
>;

/** The provenance a creator supplies: its caller, plus what it asked the gate for. */
export type ProposalCreateProvenance = ProposalCallerProvenance &
  Pick<ProposalProvenance, 'autoApproveRequested'>;
