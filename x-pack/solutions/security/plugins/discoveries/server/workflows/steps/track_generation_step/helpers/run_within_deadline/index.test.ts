/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { runWithinDeadline } from '.';

const never = () => new Promise<string>(() => {});

const run = (overrides: Partial<Parameters<typeof runWithinDeadline<string>>[0]> = {}) =>
  runWithinDeadline<string>({
    deadlineMs: 1000,
    onDeadline: () => 'late',
    task: async () => 'done',
    ...overrides,
  });

describe('runWithinDeadline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('settles with the result of a task that finishes in time', async () => {
    const result = await run();

    expect(result).toBe('done');
  });

  it('rejects with the error of a task that rejects in time', async () => {
    const pending = run({
      task: async () => {
        throw new Error('boom');
      },
    });

    await expect(pending).rejects.toThrow('boom');
  });

  it('settles with the deadline result once the deadline elapses first', async () => {
    const pending = run({ task: never });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toBe('late');
  });

  it('does not settle before the deadline', async () => {
    const onDeadline = jest.fn(() => 'late');
    const pending = run({ onDeadline, task: never });
    await jest.advanceTimersByTimeAsync(999);

    expect(onDeadline).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await pending;
  });

  it('clears its timer when the task settles first', async () => {
    await run();

    expect(jest.getTimerCount()).toBe(0);
  });
});
