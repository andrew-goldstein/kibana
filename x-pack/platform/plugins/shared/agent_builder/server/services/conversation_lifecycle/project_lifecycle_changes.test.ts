/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { projectLifecycleChanges } from './project_lifecycle_changes';

describe('projectLifecycleChanges', () => {
  const changes = {
    close_reason: { next: 'resolved' },
    severity: { next: 'high', previous: 'low' },
    status: { next: 'closed', previous: 'open' },
    summary: { next: 'free text that must stay private' },
  };

  it('keeps only the subscribed fields', () => {
    expect(projectLifecycleChanges(changes, ['status', 'severity'])).toEqual({
      severity: { next: 'high', previous: 'low' },
      status: { next: 'closed', previous: 'open' },
    });
  });

  it('ignores subscribed fields that did not change', () => {
    expect(projectLifecycleChanges(changes, ['status', 'assignee'])).toEqual({
      status: { next: 'closed', previous: 'open' },
    });
  });

  it('returns an empty object when no field is subscribed', () => {
    expect(projectLifecycleChanges(changes, [])).toEqual({});
  });

  it('does not read inherited properties', () => {
    expect(projectLifecycleChanges(changes, ['toString', 'constructor'])).toEqual({});
  });

  it('keeps an omitted side omitted', () => {
    const result = projectLifecycleChanges({ status: { previous: 'open' } }, ['status']);

    expect(result).toEqual({ status: { previous: 'open' } });
    expect(Object.keys(result.status)).toEqual(['previous']);
  });

  it('copies values so a listener cannot mutate the producer or another listener', () => {
    const source = { tags: { next: ['a', 'b'], previous: ['a'] } };

    const first = projectLifecycleChanges(source, ['tags']);
    (first.tags.next as string[]).push('mutated');
    first.tags.previous = 'replaced';

    expect(source).toEqual({ tags: { next: ['a', 'b'], previous: ['a'] } });
    expect(projectLifecycleChanges(source, ['tags'])).toEqual({
      tags: { next: ['a', 'b'], previous: ['a'] },
    });
  });
});
