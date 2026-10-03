/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SerializedMetadataValue } from '@kbn/agent-builder-common';

/** Returns a serialized metadata value when it is in the closed vocabulary, else `undefined`. */
export const pickVocabularyValue = <T extends string>(
  value: SerializedMetadataValue | undefined,
  vocabulary: readonly T[]
): T | undefined => vocabulary.find((entry) => entry === value);
