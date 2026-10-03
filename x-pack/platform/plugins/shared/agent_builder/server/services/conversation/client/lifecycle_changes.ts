/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SerializedMetadataValue } from '@kbn/agent-builder-common';
import type { ConversationLifecycleChanges } from '@kbn/agent-builder-server';

type SerializedMetadata = Record<string, SerializedMetadataValue>;

const toSerializedValue = (value: unknown): SerializedMetadataValue =>
  Array.isArray(value) ? value.map(String) : String(value);

const ownValue = (
  metadata: SerializedMetadata,
  field: string
): SerializedMetadataValue | undefined =>
  Object.prototype.hasOwnProperty.call(metadata, field) ? metadata[field] : undefined;

/**
 * Converts metadata to the serialized form it is stored in, dropping unset values. Metadata
 * written without a template (`update`) may hold unserialized values.
 */
export const toSerializedMetadata = (
  metadata: Record<string, unknown> | undefined
): SerializedMetadata =>
  Object.fromEntries(
    Object.entries(metadata ?? {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([field, value]) => [field, toSerializedValue(value)])
  );

/** Lifecycle changes of a created conversation: every field that has a value, with `next` only. */
export const buildCreatedLifecycleChanges = (
  metadata: SerializedMetadata
): ConversationLifecycleChanges =>
  Object.fromEntries(Object.entries(metadata).map(([field, next]) => [field, { next }]));

/**
 * Lifecycle changes of a metadata write: every field whose serialized value differs, omitting the
 * side on which the field is unset. Order-sensitive for arrays, like `computeChangedFields`.
 */
export const buildMetadataLifecycleChanges = ({
  next,
  previous,
}: {
  next: SerializedMetadata;
  previous: SerializedMetadata;
}): ConversationLifecycleChanges => {
  const fields = [...new Set([...Object.keys(previous), ...Object.keys(next)])];

  return Object.fromEntries(
    fields
      .map((field) => ({
        field,
        nextValue: ownValue(next, field),
        previousValue: ownValue(previous, field),
      }))
      .filter(
        ({ nextValue, previousValue }) =>
          JSON.stringify(previousValue) !== JSON.stringify(nextValue)
      )
      .map(({ field, nextValue, previousValue }) => [
        field,
        {
          ...(nextValue !== undefined ? { next: nextValue } : {}),
          ...(previousValue !== undefined ? { previous: previousValue } : {}),
        },
      ])
  );
};
