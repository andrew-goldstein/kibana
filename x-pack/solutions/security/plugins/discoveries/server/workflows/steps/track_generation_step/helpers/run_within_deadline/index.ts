/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Settles like `task`, or with `onDeadline()` once `deadlineMs` elapses first. `task` keeps
 * running after the deadline; only the wait for it stops.
 */
export const runWithinDeadline = async <T>({
  deadlineMs,
  onDeadline,
  task,
}: {
  deadlineMs: number;
  onDeadline: () => T;
  task: () => Promise<T>;
}): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onDeadline()), deadlineMs);
  });

  try {
    return await Promise.race([task(), expired]);
  } finally {
    clearTimeout(timer);
  }
};
