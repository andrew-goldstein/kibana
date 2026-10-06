/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shipped as `action_id` when the action workflow is not a managed workflow, so a
 * customer-chosen workflow id never ships.
 */
export const CUSTOM_ACTION_ID = 'custom' as const;
