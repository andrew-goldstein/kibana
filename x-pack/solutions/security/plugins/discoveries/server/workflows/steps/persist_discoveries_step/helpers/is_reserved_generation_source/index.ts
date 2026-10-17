/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ATTACK_DISCOVERY_WORKFLOW_GENERATION_SOURCE_PREFIX } from '@kbn/elastic-assistant-common';

/** Returns true when a caller-supplied `generation_source` uses the prefix only the server may set. */
export const isReservedGenerationSource = (generationSource: string | undefined): boolean =>
  generationSource?.startsWith(ATTACK_DISCOVERY_WORKFLOW_GENERATION_SOURCE_PREFIX) ?? false;
