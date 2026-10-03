/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readChainExecution } from './read_chain_execution';
import {
  ROOT_EXECUTION_ID,
  createAttackDiscoveryChain,
  createExecutionReader,
} from './worker_chain.mock';

const read = (getExecution: Parameters<typeof readChainExecution>[0]['getExecution']) =>
  readChainExecution({ getExecution, hopTimeoutMs: 5000 }, ROOT_EXECUTION_ID);

describe('readChainExecution', () => {
  it('returns the persisted execution the reader finds', async () => {
    const result = await read(createExecutionReader(createAttackDiscoveryChain()));

    expect(result).toEqual(expect.objectContaining({ id: ROOT_EXECUTION_ID }));
  });

  it('returns null when the execution is missing or hidden', async () => {
    const result = await read(createExecutionReader({}));

    expect(result).toBeNull();
  });

  it('returns null when the reader answers with another execution', async () => {
    const chain = createAttackDiscoveryChain();

    const result = await read(async () => ({ ...chain[ROOT_EXECUTION_ID], id: 'exec-other' }));

    expect(result).toBeNull();
  });

  it('returns null when the read throws', async () => {
    const result = await read(jest.fn().mockRejectedValue(new Error('index_not_found_exception')));

    expect(result).toBeNull();
  });

  describe('with a slow read', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns null once the hop timeout elapses', async () => {
      const pending = read(() => new Promise<never>(() => {}));
      await jest.advanceTimersByTimeAsync(5000);

      await expect(pending).resolves.toBeNull();
    });
  });
});
