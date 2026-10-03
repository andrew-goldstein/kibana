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

/** How long one execution read may take before it counts as unreadable. */
export const CALLER_HOP_TIMEOUT_MS = 5_000;

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
  parent: { executionId: string; workflowId: string } | undefined;
  spaceId: string;
}

/** Never throws: a lookup that fails, times out or crosses a space reads as unreadable. */
const readExecution = async (
  { abortSignal, getExecution, spaceId }: ResolveCallerProvenanceParams,
  executionId: string
): Promise<CallerExecution | undefined> => {
  if (abortSignal.aborted) {
    return undefined;
  }
  try {
    const execution = await withTimeout(getExecution(executionId), CALLER_HOP_TIMEOUT_MS);
    // The execution search also matches legacy documents with no `spaceId`,
    // so the space is compared explicitly.
    return execution?.id === executionId && execution.spaceId === spaceId ? execution : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The root of the run `execution` belongs to, or `undefined` when any ancestor
 * is unreadable: a wrong root would join the proposal to another run, whereas
 * a missing one only loses the join.
 */
const findRunRoot = async (
  params: ResolveCallerProvenanceParams,
  execution: CallerExecution,
  visited: readonly string[]
): Promise<string | undefined> => {
  const parentId = getParentExecutionId(execution.context);
  if (!parentId) {
    return execution.id;
  }
  if (visited.includes(parentId) || visited.length > MAX_CALLER_LINEAGE_HOPS) {
    return undefined;
  }
  const parent = await readExecution(params, parentId);
  return parent ? findRunRoot(params, parent, [...visited, parentId]) : undefined;
};

/**
 * A test run copies the managed identity of the workflow it tests, so only a
 * caller that is managed and not a test run is attributed to its manager.
 */
const getCallerManagedBy = ({
  isTestRun,
  managed,
  managedBy,
}: CallerExecution): string | undefined =>
  managed === true && isTestRun !== true && managedBy ? managedBy : undefined;

/**
 * Derives, from the persisted executions above the gate, who called it: the
 * calling workflow and execution, the plugin that manages it (never for a test
 * run), and the root of its run. Best-effort and never throws, so it can never
 * be what fails a proposal's creation. Caller verification is best-effort until
 * the engine exposes a trusted execution identity.
 */
export const resolveCallerProvenance = async (
  params: ResolveCallerProvenanceParams
): Promise<ProposalCallerProvenance> => {
  const { parent } = params;
  if (!parent?.executionId) {
    return {};
  }

  const identity = {
    callerWorkflowExecutionId: parent.executionId,
    callerWorkflowId: parent.workflowId,
  };

  const caller = await readExecution(params, parent.executionId);
  if (!caller) {
    return identity;
  }

  const callerRunId = await findRunRoot(params, caller, [caller.id]);
  const callerManagedBy = getCallerManagedBy(caller);

  return {
    ...identity,
    ...(callerManagedBy !== undefined ? { callerManagedBy } : {}),
    ...(callerRunId !== undefined ? { callerRunId } : {}),
  };
};
