/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { conversationWriteSources } from '@kbn/agent-builder-common';
import { mapWriteSourceToWriter } from './map_write_source';

describe('mapWriteSourceToWriter', () => {
  it.each([
    ['execution', 'agent'],
    ['workflow', 'workflow'],
    ['http_api', 'api'],
  ] as const)('reports a %s write as %s', (source, writer) => {
    expect(mapWriteSourceToWriter(source)).toBe(writer);
  });

  it('skips a server-side write, which reports itself', () => {
    expect(mapWriteSourceToWriter('server_api')).toBeUndefined();
  });

  it('maps every write source Agent Builder emits', () => {
    expect(
      conversationWriteSources.map((source) => [source, mapWriteSourceToWriter(source)])
    ).toEqual([
      ['execution', 'agent'],
      ['http_api', 'api'],
      ['server_api', undefined],
      ['workflow', 'workflow'],
    ]);
  });
});
