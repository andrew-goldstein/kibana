/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Where a proposal came from, for reporting only.
 *
 * Storage-only, like the sort ranks, and nested under one `provenance` key for
 * the same reason: the document shape says these are derived rather than
 * authored, and stripping them before a proposal leaves the service is a
 * single deletion. None of it reaches the API contract, the conversation
 * attachment or a workflow step's output.
 *
 * Only what a later write needs is stored. What only the write in progress
 * knows (whether the caller asked for auto-approval, who made the decision,
 * and which path settled it) reaches telemetry as write-time context instead
 * (see `toTelemetryRecord`). Every field is optional because a proposal
 * created outside the gate has no caller.
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
  /**
   * Whether every execution from the calling workflow up to the root of its
   * run is a managed workflow and not a test run, read from the persisted
   * executions rather than from any input. False when any of them is not, or
   * cannot be read: the gate is also reached through managed forwarders such
   * as `system-create-alertzero-proposal`, which a custom workflow can call
   * too, so the caller alone proves nothing. Absent when the gate has no
   * caller, or the caller itself cannot be read.
   */
  callerManaged?: boolean;
  /**
   * The root execution of the calling workflow's run, found by walking its
   * persisted parents, through any forwarder. Best-effort: absent when any
   * ancestor is unreadable.
   */
  callerRunId?: string;
}

/** The stored document's provenance key. Absent on a record written before it existed. */
export interface ProposalProvenanceField {
  provenance?: ProposalProvenance;
}

/** What the gate knows about its caller when it creates a proposal. */
export type ProposalCallerProvenance = Pick<ProposalProvenance, 'callerManaged' | 'callerRunId'>;
