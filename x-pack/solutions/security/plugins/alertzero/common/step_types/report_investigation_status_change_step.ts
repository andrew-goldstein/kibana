/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { ConversationUpdatedTriggerId, conversationWriteSources } from '@kbn/agent-builder-common';
import type { BaseStepDefinition } from '@kbn/workflows';
import { StepCategory } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';

export const ReportInvestigationStatusChangeStepId =
  'alertzero.reportInvestigationStatusChange' as const;

/** Liquid renders a missing value as `''`; treat it (and `null`) as absent. */
const toAbsent = (value: unknown): unknown => (value === '' || value === null ? undefined : value);

/**
 * The `ai.conversation.updated` event fields the step needs: the conversation id, which must be a
 * UUID, and the write `source`. The status itself is read by the step, never taken from input.
 */
export const reportInvestigationStatusChangeStepInputSchema = z.strictObject({
  investigation_id: z
    .preprocess(toAbsent, z.uuid())
    .describe('The conversation id of the Investigation whose status changed'),
  source: z
    .enum(conversationWriteSources)
    .describe('The `source` of the `ai.conversation.updated` event: who wrote the change'),
});

export type ReportInvestigationStatusChangeStepInput = z.output<
  typeof reportInvestigationStatusChangeStepInputSchema
>;

export const reportInvestigationStatusChangeStepOutputSchema = z.object({
  reported: z.boolean().describe('Whether the status change was reported'),
});

export const reportInvestigationStatusChangeStepCommonDefinition: BaseStepDefinition<
  typeof reportInvestigationStatusChangeStepInputSchema,
  typeof reportInvestigationStatusChangeStepOutputSchema
> = {
  id: ReportInvestigationStatusChangeStepId,
  label: i18n.translate('xpack.alertzero.steps.reportInvestigationStatusChange.label', {
    defaultMessage: 'Report AlertZero Investigation status change',
  }),
  description: i18n.translate('xpack.alertzero.steps.reportInvestigationStatusChange.description', {
    defaultMessage:
      "Reports an Investigation's current status as product telemetry. Only AlertZero's managed Investigation status listener reports; any other caller is skipped.",
  }),
  category: StepCategory.Kibana,
  stability: 'beta',
  inputSchema: reportInvestigationStatusChangeStepInputSchema,
  outputSchema: reportInvestigationStatusChangeStepOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.alertzero.steps.reportInvestigationStatusChange.documentation.details',
      {
        defaultMessage:
          'The step never fails the workflow. It reads the Investigation after the write and returns reported: false for a test run, a caller that is not an AlertZero managed workflow started by the conversation updated trigger, a server-side write, a conversation that is not an Investigation, or when telemetry could not be reported.',
      }
    ),
    examples: [
      `- name: report_status_change
  type: ${ReportInvestigationStatusChangeStepId}
  timeout: 30s
  on-failure:
    continue: true
  with:
    investigation_id: "{{ event.conversationId }}"
    source: "{{ event.source }}"`,
    ],
  },
};

/** The trigger whose runs the step reports for. */
export const INVESTIGATION_STATUS_CHANGE_TRIGGER_ID = ConversationUpdatedTriggerId;
