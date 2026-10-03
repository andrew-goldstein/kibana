/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildCreatedLifecycleChanges,
  buildMetadataLifecycleChanges,
  toSerializedMetadata,
} from './lifecycle_changes';

describe('toSerializedMetadata', () => {
  it('returns an empty object when there is no metadata', () => {
    expect(toSerializedMetadata(undefined)).toEqual({});
  });

  it('keeps string and string array values as they are', () => {
    expect(toSerializedMetadata({ status: 'open', tags: ['a', 'b'] })).toEqual({
      status: 'open',
      tags: ['a', 'b'],
    });
  });

  it('stringifies scalar values and array elements, as they are stored', () => {
    expect(toSerializedMetadata({ count: 3, enabled: true, mixed: [1, 'two'] })).toEqual({
      count: '3',
      enabled: 'true',
      mixed: ['1', 'two'],
    });
  });

  it('drops unset values', () => {
    expect(toSerializedMetadata({ cleared: null, missing: undefined, status: 'open' })).toEqual({
      status: 'open',
    });
  });

  it('does not share arrays with its input', () => {
    const tags = ['a'];
    const serialized = toSerializedMetadata({ tags });

    tags.push('mutated');

    expect(serialized).toEqual({ tags: ['a'] });
  });
});

describe('buildCreatedLifecycleChanges', () => {
  it('reports every field that has a value, with next only', () => {
    expect(buildCreatedLifecycleChanges({ severity: 'high', tags: ['a'] })).toEqual({
      severity: { next: 'high' },
      tags: { next: ['a'] },
    });
  });

  it('returns no changes when there is no metadata', () => {
    expect(buildCreatedLifecycleChanges({})).toEqual({});
  });
});

describe('buildMetadataLifecycleChanges', () => {
  it('reports the previous and next value of every changed field', () => {
    expect(
      buildMetadataLifecycleChanges({
        next: { severity: 'high', status: 'closed' },
        previous: { severity: 'low', status: 'open' },
      })
    ).toEqual({
      severity: { next: 'high', previous: 'low' },
      status: { next: 'closed', previous: 'open' },
    });
  });

  it('omits fields whose value did not change', () => {
    expect(
      buildMetadataLifecycleChanges({
        next: { severity: 'low', status: 'closed', tags: ['a', 'b'] },
        previous: { severity: 'low', status: 'open', tags: ['a', 'b'] },
      })
    ).toEqual({ status: { next: 'closed', previous: 'open' } });
  });

  it('omits previous for a field that was unset', () => {
    const changes = buildMetadataLifecycleChanges({ next: { status: 'open' }, previous: {} });

    expect(changes).toEqual({ status: { next: 'open' } });
    expect(Object.keys(changes.status)).toEqual(['next']);
  });

  it('omits next for a field that was removed', () => {
    const changes = buildMetadataLifecycleChanges({ next: {}, previous: { status: 'open' } });

    expect(changes).toEqual({ status: { previous: 'open' } });
    expect(Object.keys(changes.status)).toEqual(['previous']);
  });

  it('treats a reordered array as a change', () => {
    expect(
      buildMetadataLifecycleChanges({ next: { tags: ['b', 'a'] }, previous: { tags: ['a', 'b'] } })
    ).toEqual({ tags: { next: ['b', 'a'], previous: ['a', 'b'] } });
  });

  it('does not read inherited properties of the other side', () => {
    expect(buildMetadataLifecycleChanges({ next: { constructor: 'set' }, previous: {} })).toEqual({
      constructor: { next: 'set' },
    });
  });

  it('returns no changes when nothing changed', () => {
    expect(
      buildMetadataLifecycleChanges({ next: { status: 'open' }, previous: { status: 'open' } })
    ).toEqual({});
  });
});
