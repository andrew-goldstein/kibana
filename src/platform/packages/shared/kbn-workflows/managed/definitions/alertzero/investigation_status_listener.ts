/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  ALERTZERO_LISTENER_WORKFLOW_MANAGEMENT,
  ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
} from './constants';
import INVESTIGATION_STATUS_LISTENER_YAML from './investigation_status_listener.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID =
  'system-alertzero-investigation-status-listener';

/**
 * Reports Investigation status changes made by agents, workflows and the Agent Builder HTTP APIs,
 * the writers AlertZero and Agentic Investigations do not report themselves. Started by the
 * `ai.conversation.updated` trigger, and installed once globally: a global workflow's event runs
 * are stamped with the space of the write.
 */
export const ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW = {
  billable: false,
  id: ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID,
  management: ALERTZERO_LISTENER_WORKFLOW_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 1,
  yaml: INVESTIGATION_STATUS_LISTENER_YAML,
} as const satisfies ManagedWorkflowDefinition;
