/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SerializedMetadataValue } from '@kbn/agent-builder-common';
import type {
  ConversationLifecycleChanges,
  ConversationLifecycleFieldChange,
} from '@kbn/agent-builder-server';

const copyValue = (value: SerializedMetadataValue): SerializedMetadataValue =>
  Array.isArray(value) ? [...value] : value;

const copyChange = ({ next, previous }: ConversationLifecycleFieldChange) => ({
  ...(next !== undefined ? { next: copyValue(next) } : {}),
  ...(previous !== undefined ? { previous: copyValue(previous) } : {}),
});

/** Returns a copy of `changes` limited to `fields`, so a listener only sees what it subscribed to. */
export const projectLifecycleChanges = (
  changes: ConversationLifecycleChanges,
  fields: readonly string[]
): ConversationLifecycleChanges =>
  Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(changes, field))
      .map((field) => [field, copyChange(changes[field])])
  );
