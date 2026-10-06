/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { ALERTZERO_TELEMETRY_WORKFLOW_IDS } from '.';
import { ALERTZERO_LISTENER_WORKFLOW_MANAGEMENT } from './constants';
import {
  ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW,
  ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID,
} from './investigation_status_listener';
import { getManagedWorkflowDefinition } from '../..';

interface ListenerYaml {
  enabled: boolean;
  settings: { concurrency: Record<string, unknown> };
  steps: Array<{ name: string; type: string; with: Record<string, unknown> }>;
  triggers: Array<{ on: { condition: string }; type: string }>;
}

const listener = parse(ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW.yaml) as ListenerYaml;

describe('AlertZero Investigation status listener', () => {
  it('is a registered managed definition', () => {
    expect(getManagedWorkflowDefinition(ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID)).toBe(
      ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW
    );
  });

  it('is in the telemetry install set', () => {
    expect(ALERTZERO_TELEMETRY_WORKFLOW_IDS).toEqual([
      ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID,
    ]);
  });

  it('is an enforced, static AlertZero workflow at version 1', () => {
    expect({
      management: ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW.management,
      pluginId: ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW.pluginId,
      version: ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW.version,
    }).toEqual({
      management: ALERTZERO_LISTENER_WORKFLOW_MANAGEMENT,
      pluginId: 'alertzero',
      version: 1,
    });
  });

  it('is enabled, so the trigger starts it', () => {
    expect(listener.enabled).toBe(true);
  });

  // Asserted on the parsed YAML: the condition is a folded scalar, so its source spans lines.
  it('subscribes to status changes of existing Investigations, excluding server-side writes', () => {
    expect(listener.triggers).toEqual([
      {
        on: {
          condition:
            'event.templateId: "investigation" and event.changedFields: "status" and not event.changeKinds: "created" and not event.source: "server_api"',
        },
        type: 'ai.conversation.updated',
      },
    ]);
  });

  it('runs one at a time per Investigation, with one waiting', () => {
    expect(listener.settings.concurrency).toEqual({
      key: '{{ workflow.id }}:{{ event.conversationId }}',
      max: 1,
      'queue-size': 1,
      strategy: 'queue',
    });
  });

  it('passes only the conversation id and the write source to the report step', () => {
    expect(listener.steps.map(({ type, with: input }) => ({ input, type }))).toEqual([
      {
        input: { investigation_id: '{{ event.conversationId }}', source: '{{ event.source }}' },
        type: 'alertzero.reportInvestigationStatusChange',
      },
    ]);
  });
});
