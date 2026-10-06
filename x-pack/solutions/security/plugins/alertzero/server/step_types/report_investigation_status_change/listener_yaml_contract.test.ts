/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import { ConversationUpdatedTriggerId } from '@kbn/agent-builder-common';
import { evaluateKql } from '@kbn/eval-kql';
import { createWorkflowLiquidEngine } from '@kbn/workflows';
import {
  ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID,
  getManagedWorkflowDefinition,
} from '@kbn/workflows/managed';
import {
  ReportInvestigationStatusChangeStepId,
  reportInvestigationStatusChangeStepInputSchema,
} from '../../../common/step_types';

/**
 * The contract between the shipped Investigation status listener and the trigger and step it
 * uses. `@kbn/workflows` cannot import this plugin or `@kbn/eval-kql`, so the condition is
 * evaluated here the way the engine evaluates it: `evaluateKql(condition, { event })`.
 */

interface ListenerYaml {
  settings: { concurrency: Record<string, unknown> };
  steps: Array<{
    name: string;
    'on-failure'?: { continue?: boolean };
    timeout?: string;
    type: string;
    with: Record<string, unknown>;
  }>;
  triggers: Array<{ on: { condition: string }; type: string }>;
}

const definition = getManagedWorkflowDefinition(
  ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID
);
const listener = parse(
  definition && 'yaml' in definition && definition.yaml ? definition.yaml : ''
) as ListenerYaml;

const [trigger] = listener.triggers;
const [step] = listener.steps;

const liquid = createWorkflowLiquidEngine({ strictFilters: true, strictVariables: false });

const event = (overrides: Record<string, unknown> = {}) => ({
  actorTypes: [],
  attachmentIds: [],
  attachmentTypes: [],
  changeKinds: ['metadata'],
  changedFields: ['status', 'close_reason'],
  conversationId: '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f',
  eventTypes: [],
  source: 'execution',
  templateId: 'investigation',
  ...overrides,
});

const matches = (payload: Record<string, unknown>): boolean =>
  evaluateKql(trigger.on.condition.trim(), { event: payload });

describe('the shipped Investigation status listener', () => {
  it('is registered for the AlertZero owner', () => {
    expect(definition?.pluginId).toBe('alertzero');
  });

  it('starts only from the conversation updated trigger', () => {
    expect(listener.triggers.map(({ type }) => type)).toEqual([ConversationUpdatedTriggerId]);
  });

  it('carries the documented condition', () => {
    expect(trigger.on.condition).toBe(
      'event.templateId: "investigation" and event.changedFields: "status" and not event.changeKinds: "created" and not event.source: "server_api"'
    );
  });

  describe('trigger condition', () => {
    it.each([
      ['an agent', 'execution'],
      ['a workflow', 'workflow'],
      ['the Agent Builder HTTP API', 'http_api'],
    ])('matches a status change by %s', (_label, source) => {
      expect(matches(event({ source }))).toBe(true);
    });

    it.each([
      ['a server-side write, which reports itself', event({ source: 'server_api' })],
      [
        'a create, which seeds the status',
        event({ changeKinds: ['created', 'metadata'], changedFields: ['status'] }),
      ],
      ['a change that left the status alone', event({ changedFields: ['severity'] })],
      ['a write that changed no field', event({ changeKinds: ['events'], changedFields: [] })],
      ['an Escalation', event({ templateId: 'escalation' })],
      ['a conversation with no template', event({ templateId: undefined })],
    ])('does not match %s', (_label, payload) => {
      expect(matches(payload)).toBe(false);
    });
  });

  it('runs one at a time per Investigation, as the trigger documents', () => {
    const { key, ...rest } = listener.settings.concurrency;

    expect({
      key: liquid.parseAndRenderSync(String(key), {
        event: event(),
        workflow: { id: ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID },
      }),
      rest,
    }).toEqual({
      key: `${ALERTZERO_INVESTIGATION_STATUS_LISTENER_WORKFLOW_ID}:5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f`,
      rest: { max: 1, 'queue-size': 1, strategy: 'queue' },
    });
  });

  it('has a single report step that never fails the run', () => {
    expect(
      listener.steps.map(({ name, type, timeout, 'on-failure': onFailure }) => ({
        name,
        onFailure,
        timeout,
        type,
      }))
    ).toEqual([
      {
        name: 'report_status_change',
        onFailure: { continue: true },
        timeout: '30s',
        type: ReportInvestigationStatusChangeStepId,
      },
    ]);
  });

  it.each(['execution', 'workflow', 'http_api'])(
    'renders a step input the schema accepts for a %s write',
    (source) => {
      const rendered = Object.fromEntries(
        Object.entries(step.with).map(([key, value]) => [
          key,
          liquid.parseAndRenderSync(String(value), { event: event({ source }) }),
        ])
      );

      expect(reportInvestigationStatusChangeStepInputSchema.safeParse(rendered)).toEqual({
        data: { investigation_id: '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f', source },
        success: true,
      });
    }
  );
});
