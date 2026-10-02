/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalTelemetryCategory } from './constants';
import { KNOWN_CATEGORIES, OTHER_CATEGORY } from './constants';

const isKnownCategory = (category: string): category is (typeof KNOWN_CATEGORIES)[number] =>
  (KNOWN_CATEGORIES as readonly string[]).includes(category);

/** Maps a proposal's open category keyword onto the closed telemetry vocabulary. */
export const toTelemetryCategory = (
  category: string | undefined
): ProposalTelemetryCategory | undefined => {
  if (!category) {
    return undefined;
  }
  return isKnownCategory(category) ? category : OTHER_CATEGORY;
};
