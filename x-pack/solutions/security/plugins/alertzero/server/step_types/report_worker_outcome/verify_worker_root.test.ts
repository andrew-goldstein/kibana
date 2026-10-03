/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { VerifyWorkerRootParams } from './verify_worker_root';
import { verifyWorkerRoot } from './verify_worker_root';
import {
  ENGINE_ROOT,
  ROOT_EXECUTION_ID,
  SPACE_ID,
  createAttackDiscoveryChain,
  createExecutionReader,
} from './worker_chain.mock';

const createParams = (overrides: Partial<VerifyWorkerRootParams> = {}): VerifyWorkerRootParams => ({
  abortSignal: new AbortController().signal,
  getExecution: createExecutionReader(createAttackDiscoveryChain()),
  hopTimeoutMs: 5000,
  root: ENGINE_ROOT,
  spaceId: SPACE_ID,
  ...overrides,
});

const withRootChange = (change: Record<string, unknown>) => {
  const chain = createAttackDiscoveryChain();
  return createExecutionReader({
    ...chain,
    [ROOT_EXECUTION_ID]: { ...chain[ROOT_EXECUTION_ID], ...change },
  });
};

describe('verifyWorkerRoot', () => {
  it('verifies the catalog Worker root the engine names', async () => {
    const result = await verifyWorkerRoot(createParams());

    expect(result).toEqual({
      root: expect.objectContaining({ id: ROOT_EXECUTION_ID }),
      verified: true,
    });
  });

  it('reads only the root, never the executions between it and the reporter', async () => {
    const getExecution = createExecutionReader(createAttackDiscoveryChain());

    await verifyWorkerRoot(createParams({ getExecution }));

    expect(getExecution.mock.calls).toEqual([[ROOT_EXECUTION_ID]]);
  });

  it('rejects a root that cannot be read', async () => {
    const result = await verifyWorkerRoot(
      createParams({ getExecution: createExecutionReader({}) })
    );

    expect(result).toEqual({ reason: 'lineage_unavailable', verified: false });
  });

  it('rejects a root persisted for another workflow than the engine names', async () => {
    const result = await verifyWorkerRoot(
      createParams({ root: { ...ENGINE_ROOT, workflowId: 'wf-other' } })
    );

    expect(result).toEqual({ reason: 'lineage_unavailable', verified: false });
  });

  it('rejects a root that itself has a parent', async () => {
    const result = await verifyWorkerRoot(
      createParams({
        getExecution: withRootChange({ context: { parentWorkflowExecutionId: 'exec-above' } }),
      })
    );

    expect(result).toEqual({ reason: 'lineage_unavailable', verified: false });
  });

  it.each([
    ['in another space', { spaceId: 'space-b' }, 'lineage_unavailable'],
    ['persisted as a test run', { isTestRun: true }, 'test_run'],
    ['not managed', { managed: false }, 'not_managed'],
    ['managed by another plugin', { managedBy: 'proposals' }, 'not_managed'],
    [
      'outside the Worker catalog',
      { originManagedWorkflowId: 'custom-workflow' },
      'not_catalog_root',
    ],
  ])('rejects a root %s', async (_label, change, reason) => {
    const result = await verifyWorkerRoot(createParams({ getExecution: withRootChange(change) }));

    expect(result).toEqual({ reason, verified: false });
  });

  it('stops before the read when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const getExecution = createExecutionReader(createAttackDiscoveryChain());

    const result = await verifyWorkerRoot(
      createParams({ abortSignal: controller.signal, getExecution })
    );

    expect({ calls: getExecution.mock.calls.length, result }).toEqual({
      calls: 0,
      result: { reason: 'aborted', verified: false },
    });
  });
});
