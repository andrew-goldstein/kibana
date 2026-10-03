/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Milliseconds from an ISO timestamp to `now`, or `undefined` when the timestamp is missing,
 * unparseable, or in the future (clock skew), so a bad value is omitted rather than shipped.
 */
export const computeElapsedMs = ({
  from,
  now,
}: {
  from: string | undefined;
  now: number;
}): number | undefined => {
  if (from === undefined) {
    return undefined;
  }
  const elapsedMs = now - Date.parse(from);
  return Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : undefined;
};
