/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CallerExecution, ResolveCallerProvenanceParams } from './resolve_caller_provenance';
import {
  CALLER_HOP_TIMEOUT_MS,
  MAX_CALLER_LINEAGE_HOPS,
  resolveCallerProvenance,
} from './resolve_caller_provenance';

const SPACE_ID = 'space-a';

const PARENT = { executionId: 'exec-caller', workflowId: 'wf-caller' };

const execution = (overrides: Partial<CallerExecution> = {}): CallerExecution => ({
  context: {},
  id: 'exec-caller',
  isTestRun: false,
  managed: true,
  managedBy: 'alertzero',
  spaceId: SPACE_ID,
  ...overrides,
});

/** Serves each execution by id, and `null` for anything it does not hold. */
const executionsById =
  (...executions: CallerExecution[]): ResolveCallerProvenanceParams['getExecution'] =>
  async (executionId) =>
    executions.find(({ id }) => id === executionId) ?? null;

const params = (
  overrides: Partial<ResolveCallerProvenanceParams> = {}
): ResolveCallerProvenanceParams => ({
  abortSignal: new AbortController().signal,
  getExecution: executionsById(execution()),
  parent: PARENT,
  spaceId: SPACE_ID,
  ...overrides,
});

describe('resolveCallerProvenance', () => {
  it('returns nothing for a gate run directly, since it has no caller', async () => {
    const getExecution = jest.fn();

    const provenance = await resolveCallerProvenance(params({ getExecution, parent: undefined }));

    expect(provenance).toEqual({});
  });

  it('does not read anything for a gate run directly', async () => {
    const getExecution = jest.fn();

    await resolveCallerProvenance(params({ getExecution, parent: undefined }));

    expect(getExecution).not.toHaveBeenCalled();
  });

  it('returns nothing when the parent carries a blank execution id', async () => {
    const provenance = await resolveCallerProvenance(
      params({ parent: { executionId: '', workflowId: 'wf-caller' } })
    );

    expect(provenance).toEqual({});
  });

  it('records the caller, its manager and itself as the run for a top-level caller', async () => {
    const provenance = await resolveCallerProvenance(params());

    expect(provenance).toEqual({
      callerManagedBy: 'alertzero',
      callerRunId: 'exec-caller',
      callerWorkflowExecutionId: 'exec-caller',
      callerWorkflowId: 'wf-caller',
    });
  });

  it('walks both persisted context shapes up to the root of the run', async () => {
    const getExecution = executionsById(
      execution({ context: { parentWorkflowExecutionId: 'exec-runner' } }),
      execution({ context: { parent: { executionId: 'exec-floor' } }, id: 'exec-runner' }),
      execution({ id: 'exec-floor' })
    );

    const { callerRunId } = await resolveCallerProvenance(params({ getExecution }));

    expect(callerRunId).toBe('exec-floor');
  });

  it('reads every execution in the gate space', async () => {
    const getExecution = jest.fn(executionsById(execution()));

    await resolveCallerProvenance(params({ getExecution }));

    expect(getExecution).toHaveBeenCalledWith('exec-caller');
  });

  it.each([
    ['not managed', { managed: false }],
    ['managed with no manager', { managedBy: null }],
    ['managed with a blank manager', { managedBy: '' }],
    ['missing the managed flag', { managed: undefined }],
  ])('leaves the manager unset for a caller %s', async (_label, overrides) => {
    const { callerManagedBy } = await resolveCallerProvenance(
      params({ getExecution: executionsById(execution(overrides)) })
    );

    expect(callerManagedBy).toBeUndefined();
  });

  it('leaves the manager unset for a test run of a managed caller', async () => {
    // A test run copies the managed identity of the workflow it tests, so it
    // would otherwise be counted as that plugin's own use of proposals.
    const { callerManagedBy } = await resolveCallerProvenance(
      params({ getExecution: executionsById(execution({ isTestRun: true })) })
    );

    expect(callerManagedBy).toBeUndefined();
  });

  it('keeps the ids and the run of a test-run caller', async () => {
    const provenance = await resolveCallerProvenance(
      params({ getExecution: executionsById(execution({ isTestRun: true })) })
    );

    expect(provenance).toEqual({
      callerRunId: 'exec-caller',
      callerWorkflowExecutionId: 'exec-caller',
      callerWorkflowId: 'wf-caller',
    });
  });

  it.each([
    ['is missing or hidden', executionsById()],
    [
      'fails to read',
      async () => {
        throw new Error('index unavailable');
      },
    ],
    ['is in another space', executionsById(execution({ spaceId: 'space-b' }))],
    ['answers with a different id', executionsById(execution({ id: 'exec-other' }))],
  ])('keeps only the context ids when the caller %s', async (_label, getExecution) => {
    const provenance = await resolveCallerProvenance(
      params({ getExecution: getExecution as ResolveCallerProvenanceParams['getExecution'] })
    );

    expect(provenance).toEqual({
      callerWorkflowExecutionId: 'exec-caller',
      callerWorkflowId: 'wf-caller',
    });
  });

  it('keeps the manager but leaves the run unset when an ancestor is unreachable', async () => {
    // A wrong run id would join the proposal to someone else's run; no id only
    // loses the join.
    const getExecution = executionsById(
      execution({ context: { parentWorkflowExecutionId: 'exec-hidden' } })
    );

    const provenance = await resolveCallerProvenance(params({ getExecution }));

    expect(provenance).toEqual({
      callerManagedBy: 'alertzero',
      callerWorkflowExecutionId: 'exec-caller',
      callerWorkflowId: 'wf-caller',
    });
  });

  it('leaves the run unset when an ancestor is in another space', async () => {
    const getExecution = executionsById(
      execution({ context: { parentWorkflowExecutionId: 'exec-root' } }),
      execution({ id: 'exec-root', spaceId: 'space-b' })
    );

    const { callerRunId } = await resolveCallerProvenance(params({ getExecution }));

    expect(callerRunId).toBeUndefined();
  });

  it('leaves the run unset on a lineage that points in a circle', async () => {
    const getExecution = executionsById(
      execution({ context: { parentWorkflowExecutionId: 'exec-a' } }),
      execution({ context: { parentWorkflowExecutionId: 'exec-caller' }, id: 'exec-a' })
    );

    const { callerRunId } = await resolveCallerProvenance(params({ getExecution }));

    expect(callerRunId).toBeUndefined();
  });

  it(`gives up on the run past ${MAX_CALLER_LINEAGE_HOPS} ancestors`, async () => {
    const ancestors = Array.from({ length: MAX_CALLER_LINEAGE_HOPS + 1 }, (_, index) =>
      execution({
        context:
          index < MAX_CALLER_LINEAGE_HOPS ? { parentWorkflowExecutionId: `exec-${index + 1}` } : {},
        id: `exec-${index}`,
      })
    );
    const getExecution = executionsById(
      execution({ context: { parentWorkflowExecutionId: 'exec-0' } }),
      ...ancestors
    );

    const { callerRunId } = await resolveCallerProvenance(params({ getExecution }));

    expect(callerRunId).toBeUndefined();
  });

  it(`reaches a root exactly ${MAX_CALLER_LINEAGE_HOPS} ancestors up`, async () => {
    const ancestors = Array.from({ length: MAX_CALLER_LINEAGE_HOPS }, (_, index) =>
      execution({
        context:
          index < MAX_CALLER_LINEAGE_HOPS - 1
            ? { parentWorkflowExecutionId: `exec-${index + 1}` }
            : {},
        id: `exec-${index}`,
      })
    );
    const getExecution = executionsById(
      execution({ context: { parentWorkflowExecutionId: 'exec-0' } }),
      ...ancestors
    );

    const { callerRunId } = await resolveCallerProvenance(params({ getExecution }));

    expect(callerRunId).toBe(`exec-${MAX_CALLER_LINEAGE_HOPS - 1}`);
  });

  it('reads nothing once the step has been aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const getExecution = jest.fn(executionsById(execution()));

    await resolveCallerProvenance(params({ abortSignal: controller.signal, getExecution }));

    expect(getExecution).not.toHaveBeenCalled();
  });

  it('keeps only the context ids once the step has been aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const provenance = await resolveCallerProvenance(params({ abortSignal: controller.signal }));

    expect(provenance).toEqual({
      callerWorkflowExecutionId: 'exec-caller',
      callerWorkflowId: 'wf-caller',
    });
  });

  it('stops walking when the step is aborted mid-walk', async () => {
    const controller = new AbortController();
    const getExecution = jest.fn(async (executionId: string) => {
      controller.abort();
      return executionsById(
        execution({ context: { parentWorkflowExecutionId: 'exec-root' } }),
        execution({ id: 'exec-root' })
      )(executionId);
    });

    const { callerRunId } = await resolveCallerProvenance(
      params({ abortSignal: controller.signal, getExecution })
    );

    expect(callerRunId).toBeUndefined();
  });

  describe('with a slow read', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it(`treats a read slower than ${CALLER_HOP_TIMEOUT_MS}ms as unavailable`, async () => {
      const pending = resolveCallerProvenance(
        params({ getExecution: () => new Promise<never>(() => {}) })
      );
      await jest.advanceTimersByTimeAsync(CALLER_HOP_TIMEOUT_MS);

      await expect(pending).resolves.toEqual({
        callerWorkflowExecutionId: 'exec-caller',
        callerWorkflowId: 'wf-caller',
      });
    });
  });
});
