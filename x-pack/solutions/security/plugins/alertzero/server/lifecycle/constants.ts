/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationLifecycleFilter } from '@kbn/agent-builder-server';
import { TEMPLATE_ID_INVESTIGATION } from '@kbn/alertzero-common';

/** The `investigation` template field holding the open/closed status. */
export const INVESTIGATION_STATUS_FIELD = 'status' as const;

/** The `investigation` template field holding the severity. */
export const INVESTIGATION_SEVERITY_FIELD = 'severity' as const;

/** The `investigation` template field holding the close reason. */
export const INVESTIGATION_CLOSE_REASON_FIELD = 'close_reason' as const;

/**
 * The `investigation` template's closed SELECT fields the listener needs. Free-text fields
 * (`verdict`, `summary`, `description`) are never subscribed, so their values never reach it.
 */
export const INVESTIGATION_LIFECYCLE_FILTER: ConversationLifecycleFilter = {
  fields: [
    INVESTIGATION_STATUS_FIELD,
    INVESTIGATION_SEVERITY_FIELD,
    INVESTIGATION_CLOSE_REASON_FIELD,
  ],
  templateIds: [TEMPLATE_ID_INVESTIGATION],
};

/** Events handled concurrently; a burst of Worker reviews beyond this is dropped. */
export const MAX_IN_FLIGHT_LIFECYCLE_EVENTS = 20;

/** Budget for each managed-workflow lookup the listener makes. */
export const LIFECYCLE_LOOKUP_TIMEOUT_MS = 5000;
