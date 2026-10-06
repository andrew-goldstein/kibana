/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowExecutionDto } from '@kbn/workflows';
import type { ProposalCallerProvenance } from '../storage/proposal_provenance';
import { getParentExecutionId } from './get_parent_execution_id';
import { withTimeout } from './with_timeout';

/** Ancestors the run-root walk follows at most; matches the engine's default `maxWorkflowDepth`. */
export const MAX_CALLER_LINEAGE_HOPS = 10;

/** How long the whole caller walk may take; a read still pending then counts as unreadable. */
export const CALLER_WALK_TIMEOUT_MS = 5_000;

/** The persisted execution fields the lookup reads. A management `WorkflowExecutionDto` fits. */
export type CallerExecution = Pick<
  WorkflowExecutionDto,
  'context' | 'id' | 'isTestRun' | 'managed' | 'managedBy' | 'spaceId'
>;

export interface ResolveCallerProvenanceParams {
  abortSignal: AbortSignal;
  /** Reads one persisted execution in `spaceId`, or `null` when it is missing or hidden. */
  getExecution: (executionId: string) => Promise<CallerExecution | null | undefined>;
  /** The gate's own `parent` context: the workflow execution that called it. */
  parent: { executionId: string } | undefined;
  spaceId: string;
}

/** One walk: the step's parameters plus the time by which every read must have answered. */
type CallerWalk = ResolveCallerProvenanceParams & { deadline: number };

/** Never throws: a lookup that fails, runs past the deadline or crosses a space reads as unreadable. */
const readExecution = async (
  { abortSignal, deadline, getExecution, spaceId }: CallerWalk,
  executionId: string
): Promise<CallerExecution | undefined> => {
  const remainingMs = deadline - Date.now();
  if (abortSignal.aborted || remainingMs <= 0) {
    return undefined;
  }
  try {
    // The workflows execution read takes no abort signal, so a read cut off
    // by the deadline cannot be cancelled: it finishes unobserved.
    const execution = await withTimeout(getExecution(executionId), remainingMs);
    // The execution search also matches legacy documents with no `spaceId`,
    // so the space is compared explicitly.
    return execution?.id === executionId && execution.spaceId === spaceId ? execution : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Every execution from `execution` up to the root of its run, root last, or
 * `undefined` when any ancestor is unreadable: a wrong root would join the
 * proposal to another run, whereas a missing one only loses the join.
 */
const findRunLineage = async (
  params: CallerWalk,
  execution: CallerExecution,
  visited: readonly string[]
): Promise<readonly CallerExecution[] | undefined> => {
  const parentId = getParentExecutionId(execution.context);
  if (!parentId) {
    return [execution];
  }
  if (visited.includes(parentId) || visited.length > MAX_CALLER_LINEAGE_HOPS) {
    return undefined;
  }
  const parent = await readExecution(params, parentId);
  const ancestors = parent
    ? await findRunLineage(params, parent, [...visited, parentId])
    : undefined;
  return ancestors ? [execution, ...ancestors] : undefined;
};

/**
 * A test run copies the managed identity of the workflow it tests, so it is
 * not its manager's own use of proposals. The engine marks every child of a
 * test run as one too.
 */
const isManagedRun = ({ isTestRun, managed, managedBy }: CallerExecution): boolean =>
  managed === true && isTestRun !== true && Boolean(managedBy);

/**
 * Derives, from the persisted executions above the gate, whether the whole
 * calling run is managed (never for a test run) and the root of that run. The
 * calling workflow's own ids are not kept: nothing reads them, and a custom
 * caller's workflow id is chosen by the customer. Never throws, so it can
 * never be what fails a proposal's creation. The caller check is best-effort.
 *
 * Every hop has to be managed, not just the gate's parent: managed forwarders
 * such as `system-create-alertzero-proposal` sit between a Worker and the
 * gate, and a custom workflow can call one as easily as a Worker can.
 */
export const resolveCallerProvenance = async (
  params: ResolveCallerProvenanceParams
): Promise<ProposalCallerProvenance> => {
  const { parent } = params;
  if (!parent?.executionId) {
    return {};
  }
  // One budget for the whole walk, not one per read, so a slow chain holds
  // the proposal's creation for at most `CALLER_WALK_TIMEOUT_MS`.
  const walk: CallerWalk = { ...params, deadline: Date.now() + CALLER_WALK_TIMEOUT_MS };

  const caller = await readExecution(walk, parent.executionId);
  if (!caller) {
    return {};
  }

  const lineage = await findRunLineage(walk, caller, [caller.id]);
  const root = lineage?.[lineage.length - 1];

  return {
    // An unread ancestor could be anyone's workflow, so it leaves the caller unverified.
    callerManaged: lineage !== undefined && lineage.every(isManagedRun),
    ...(root !== undefined ? { callerRunId: root.id } : {}),
  };
};
