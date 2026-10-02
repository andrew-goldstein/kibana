/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CallerExecution, ResolveCallerProvenanceParams } from './resolve_caller_provenance';
import {
  CALLER_WALK_TIMEOUT_MS,
  MAX_CALLER_LINEAGE_HOPS,
  resolveCallerProvenance,
} from './resolve_caller_provenance';

const SPACE_ID = 'space-a';

const PARENT = { executionId: 'exec-caller' };

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
    const provenance = await resolveCallerProvenance(params({ parent: { executionId: '' } }));

    expect(provenance).toEqual({});
  });

  it('verifies a top-level caller as managed and records it as the run', async () => {
    const provenance = await resolveCallerProvenance(params());

    expect(provenance).toEqual({ callerManaged: true, callerRunId: 'exec-caller' });
  });

  it('never records the calling workflow or its execution, which nothing reads', async () => {
    // A custom caller's workflow id is chosen by the customer.
    const provenance = await resolveCallerProvenance(params());

    expect(Object.keys(provenance)).toEqual(['callerManaged', 'callerRunId']);
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
  ])('does not verify a caller %s as managed', async (_label, overrides) => {
    const { callerManaged } = await resolveCallerProvenance(
      params({ getExecution: executionsById(execution(overrides)) })
    );

    expect(callerManaged).toBe(false);
  });

  it('does not verify a test run of a managed caller as managed', async () => {
    // A test run copies the managed identity of the workflow it tests, so it
    // would otherwise be counted as that plugin's own use of proposals.
    const { callerManaged } = await resolveCallerProvenance(
      params({ getExecution: executionsById(execution({ isTestRun: true })) })
    );

    expect(callerManaged).toBe(false);
  });

  it('keeps the run of a test-run caller', async () => {
    const provenance = await resolveCallerProvenance(
      params({ getExecution: executionsById(execution({ isTestRun: true })) })
    );

    expect(provenance).toEqual({ callerManaged: false, callerRunId: 'exec-caller' });
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
  ])('records nothing when the caller %s', async (_label, getExecution) => {
    const provenance = await resolveCallerProvenance(
      params({ getExecution: getExecution as ResolveCallerProvenanceParams['getExecution'] })
    );

    expect(provenance).toEqual({});
  });

  it('leaves the run unset and the caller unverified when an ancestor is unreachable', async () => {
    // A wrong run id would join the proposal to someone else's run; no id only
    // loses the join. An unread ancestor could be a custom workflow, so a
    // managed caller below it is not verified either.
    const getExecution = executionsById(
      execution({ context: { parentWorkflowExecutionId: 'exec-hidden' } })
    );

    const provenance = await resolveCallerProvenance(params({ getExecution }));

    expect(provenance).toEqual({ callerManaged: false });
  });

  describe('through a forwarding wrapper', () => {
    // A Worker reaches the gate through `system-create-alertzero-proposal`, so
    // the gate's direct parent is the wrapper, not the Worker: floor, runner,
    // review, wrapper, then the gate.
    const WRAPPER_PARENT = { executionId: 'exec-wrapper' };
    const wrapper = execution({
      context: { parentWorkflowExecutionId: 'exec-review' },
      id: 'exec-wrapper',
    });
    const review = execution({
      context: { parent: { executionId: 'exec-runner' } },
      id: 'exec-review',
    });
    const runner = execution({
      context: { parentWorkflowExecutionId: 'exec-floor' },
      id: 'exec-runner',
    });
    const floor = execution({ id: 'exec-floor' });

    it('walks past the wrapper to the root of the Worker run', async () => {
      const { callerRunId } = await resolveCallerProvenance(
        params({
          getExecution: executionsById(wrapper, review, runner, floor),
          parent: WRAPPER_PARENT,
        })
      );

      expect(callerRunId).toBe('exec-floor');
    });

    it('records only the verified caller and the Worker run, never the wrapper', async () => {
      const provenance = await resolveCallerProvenance(
        params({
          getExecution: executionsById(wrapper, review, runner, floor),
          parent: WRAPPER_PARENT,
        })
      );

      expect(provenance).toEqual({ callerManaged: true, callerRunId: 'exec-floor' });
    });

    it('does not verify a custom workflow that calls the managed wrapper', async () => {
      // The wrapper is managed, so checking only the gate's direct parent
      // would let any custom workflow pass as a managed caller.
      const custom = execution({ id: 'exec-custom', managed: false, managedBy: null });
      const customWrapper = execution({
        context: { parentWorkflowExecutionId: 'exec-custom' },
        id: 'exec-wrapper',
      });

      const provenance = await resolveCallerProvenance(
        params({ getExecution: executionsById(customWrapper, custom), parent: WRAPPER_PARENT })
      );

      expect(provenance).toEqual(
        expect.objectContaining({ callerManaged: false, callerRunId: 'exec-custom' })
      );
    });

    it('does not verify a chain with a test run anywhere above the wrapper', async () => {
      const { callerManaged } = await resolveCallerProvenance(
        params({
          getExecution: executionsById(
            wrapper,
            review,
            runner,
            execution({ id: 'exec-floor', isTestRun: true })
          ),
          parent: WRAPPER_PARENT,
        })
      );

      expect(callerManaged).toBe(false);
    });

    it('verifies a chain whose hops are managed by different plugins', async () => {
      const { callerManaged } = await resolveCallerProvenance(
        params({
          getExecution: executionsById(
            wrapper,
            review,
            runner,
            execution({ id: 'exec-floor', managedBy: 'nightshift' })
          ),
          parent: WRAPPER_PARENT,
        })
      );

      expect(callerManaged).toBe(true);
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

    const { callerManaged, callerRunId } = await resolveCallerProvenance(params({ getExecution }));

    expect([callerRunId, callerManaged]).toEqual([undefined, false]);
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

    const { callerManaged, callerRunId } = await resolveCallerProvenance(params({ getExecution }));

    expect([callerRunId, callerManaged]).toEqual([`exec-${MAX_CALLER_LINEAGE_HOPS - 1}`, true]);
  });

  it('reads nothing once the step has been aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const getExecution = jest.fn(executionsById(execution()));

    await resolveCallerProvenance(params({ abortSignal: controller.signal, getExecution }));

    expect(getExecution).not.toHaveBeenCalled();
  });

  it('records nothing once the step has been aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const provenance = await resolveCallerProvenance(params({ abortSignal: controller.signal }));

    expect(provenance).toEqual({});
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

    it(`treats a read slower than ${CALLER_WALK_TIMEOUT_MS}ms as unavailable`, async () => {
      const pending = resolveCallerProvenance(
        params({ getExecution: () => new Promise<never>(() => {}) })
      );
      await jest.advanceTimersByTimeAsync(CALLER_WALK_TIMEOUT_MS);

      await expect(pending).resolves.toEqual({});
    });

    it(`gives up on the whole walk after ${CALLER_WALK_TIMEOUT_MS}ms in total, not per read`, async () => {
      // Every read answers well inside the budget, but the chain does not: the
      // second ancestor's read is still pending when the budget runs out.
      const readMs = CALLER_WALK_TIMEOUT_MS * 0.4;
      const readNow = executionsById(
        execution({ context: { parentWorkflowExecutionId: 'exec-1' } }),
        execution({ context: { parentWorkflowExecutionId: 'exec-2' }, id: 'exec-1' }),
        execution({ context: { parentWorkflowExecutionId: 'exec-3' }, id: 'exec-2' }),
        execution({ id: 'exec-3' })
      );
      const getExecution: ResolveCallerProvenanceParams['getExecution'] = (executionId) =>
        new Promise((resolve) => setTimeout(() => resolve(readNow(executionId)), readMs));
      const settled = jest.fn();

      void resolveCallerProvenance(params({ getExecution })).then(settled);
      await jest.advanceTimersByTimeAsync(CALLER_WALK_TIMEOUT_MS);

      expect(settled).toHaveBeenCalledWith({ callerManaged: false });
    });
  });
});
