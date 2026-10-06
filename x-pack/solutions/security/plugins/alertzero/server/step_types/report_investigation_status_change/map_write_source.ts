/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationWriteSource } from '@kbn/agent-builder-common';
import type { InvestigationStatusWriter } from '../../../common/telemetry/constants';

const WRITERS: Readonly<Record<ConversationWriteSource, InvestigationStatusWriter | undefined>> = {
  execution: 'agent',
  http_api: 'api',
  // Server-side writes report themselves: Agentic Investigations reports its own, and so does
  // AlertZero's Hunt reopen. The listener's trigger condition already excludes them.
  server_api: undefined,
  workflow: 'workflow',
};

/** Maps an `ai.conversation.updated` write source to the writer reported, or `undefined` to skip it. */
export const mapWriteSourceToWriter = (
  source: ConversationWriteSource
): InvestigationStatusWriter | undefined => WRITERS[source];
