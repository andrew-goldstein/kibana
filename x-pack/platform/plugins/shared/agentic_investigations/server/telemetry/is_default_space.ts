/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

/** Whether a space is the default one; events ship this flag, never the space id. */
export const isDefaultSpace = (spaceId: string): boolean => spaceId === DEFAULT_SPACE_ID;
