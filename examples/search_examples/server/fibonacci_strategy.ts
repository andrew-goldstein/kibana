/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 as uuidv4 } from 'uuid';
import { ISearchStrategy } from '@kbn/data-plugin/server';
import { of } from 'rxjs';
import { FibonacciRequest, FibonacciResponse } from '../common/types';

export const fibonacciStrategyProvider = (): ISearchStrategy<
  FibonacciRequest,
  FibonacciResponse
> => {
  const responseMap = new Map<string, [number[], number, number]>();
  return {
    search: (request: FibonacciRequest) => {
      const id = request.id ?? uuidv4();
      const [sequence, total, started] = responseMap.get(id) ?? [
        [],
        request.params?.n ?? 0,
        Date.now(),
      ];
      if (sequence.length < 2) {
        if (total > 0) sequence.push(sequence.length);
      } else {
        const [a, b] = sequence.slice(-2);
        sequence.push(a + b);
      }
      const loaded = sequence.length;
      responseMap.set(id, [sequence, total, started]);
      if (loaded >= total) {
        responseMap.delete(id);
      }

      const isRunning = loaded < total;
      const isPartial = isRunning;
      const took = Date.now() - started;
      const values = sequence.slice(0, loaded);

      return of({ id, loaded, total, isRunning, isPartial, rawResponse: { took, values } });
    },
    cancel: async (id: string) => {
      responseMap.delete(id);
    },
  } as unknown as ISearchStrategy<FibonacciRequest, FibonacciResponse>;
};
