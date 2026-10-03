/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ManagedWorkflowInstanceState,
  ManagedWorkflowStateApi,
} from '@kbn/workflows/server/types';
import { readInstalledWorkflow } from './read_installed_workflow';

const STATE: ManagedWorkflowInstanceState = {
  definitionId: 'system-security-attack-discovery-review',
  documentVersion: 1,
  spaceId: '*',
  templateValues: null,
  workflowId: 'system-security-attack-discovery-review',
};

const createState = (
  getInstalledWorkflowState: ManagedWorkflowStateApi['getInstalledWorkflowState']
): ManagedWorkflowStateApi => ({
  getInstalledWorkflowState: jest.fn(getInstalledWorkflowState),
  listInstalledWorkflowStates: jest.fn(),
});

const read = (
  state: ManagedWorkflowStateApi | undefined,
  { spaceId = 'default', timeoutMs = 5000 }: { spaceId?: string; timeoutMs?: number } = {}
) =>
  readInstalledWorkflow({
    getManagedWorkflowState: async () => state,
    spaceId,
    timeoutMs,
    workflowId: 'system-security-attack-discovery-review',
  });

describe('readInstalledWorkflow', () => {
  it('returns the workflow AlertZero installed in the space', async () => {
    const state = createState(async () => STATE);

    expect(await read(state)).toBe(STATE);
    expect(state.getInstalledWorkflowState).toHaveBeenCalledWith(
      'system-security-attack-discovery-review',
      'default'
    );
  });

  it('falls back to the global space its shared Workers live in', async () => {
    const state = createState(async (_id, spaceId) => (spaceId === '*' ? STATE : null));

    expect(await read(state)).toBe(STATE);
  });

  it('does not repeat the lookup when the space is the global space', async () => {
    const state = createState(async () => null);

    expect(await read(state, { spaceId: '*' })).toBeNull();
    expect(state.getInstalledWorkflowState).toHaveBeenCalledTimes(1);
  });

  it('returns null for a workflow AlertZero does not own in either space', async () => {
    expect(await read(createState(async () => null))).toBeNull();
  });

  it('returns null without the managed workflows client', async () => {
    expect(await read(undefined)).toBeNull();
  });

  it('rejects when a lookup outlives the timeout', async () => {
    const state = createState(() => new Promise(() => {}));

    await expect(read(state, { timeoutMs: 1 })).rejects.toThrow('Timed out after 1ms');
  });

  it('rejects when the managed workflows client never resolves', async () => {
    await expect(
      readInstalledWorkflow({
        getManagedWorkflowState: () => new Promise(() => {}),
        spaceId: 'default',
        timeoutMs: 1,
        workflowId: 'system-security-attack-discovery-review',
      })
    ).rejects.toThrow('Timed out after 1ms');
  });
});
