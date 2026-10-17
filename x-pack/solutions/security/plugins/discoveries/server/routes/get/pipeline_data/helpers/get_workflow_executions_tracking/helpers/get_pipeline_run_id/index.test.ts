/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getPipelineRunId } from '.';

describe('getPipelineRunId', () => {
  it('returns the event.id of a generation-started event', () => {
    const hits = [
      { _source: { event: { action: 'generate-step-started', id: 'generation-run-id' } } },
      { _source: { event: { action: 'generation-started', id: 'pipeline-run-id' } } },
    ];

    expect(getPipelineRunId(hits)).toBe('pipeline-run-id');
  });

  it('returns the event.id of the first (most recent) generation-started event', () => {
    const hits = [
      { _source: { event: { action: 'generation-started', id: 'newer-pipeline-run-id' } } },
      { _source: { event: { action: 'generation-started', id: 'older-pipeline-run-id' } } },
    ];

    expect(getPipelineRunId(hits)).toBe('newer-pipeline-run-id');
  });

  it('returns undefined when the generation-started event has no event.id (orchestrator run)', () => {
    const hits = [{ _source: { event: { action: 'generation-started' } } }];

    expect(getPipelineRunId(hits)).toBeUndefined();
  });

  it('returns undefined when the generation-started event.id is empty', () => {
    const hits = [{ _source: { event: { action: 'generation-started', id: '' } } }];

    expect(getPipelineRunId(hits)).toBeUndefined();
  });

  it('ignores event.id on events other than generation-started', () => {
    const hits = [
      { _source: { event: { action: 'generation-succeeded', id: 'some-run-id' } } },
      { _source: { event: { action: 'validation-started', id: 'validation-run-id' } } },
    ];

    expect(getPipelineRunId(hits)).toBeUndefined();
  });

  it('returns undefined when a hit has no _source', () => {
    expect(getPipelineRunId([{}])).toBeUndefined();
  });

  it('returns undefined when there are no hits', () => {
    expect(getPipelineRunId([])).toBeUndefined();
  });
});
