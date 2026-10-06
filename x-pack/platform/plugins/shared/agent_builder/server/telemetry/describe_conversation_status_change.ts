/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Conversation,
  ConversationTemplate,
  ConversationWriteSource,
} from '@kbn/agent-builder-common';
import type { ReportConversationStatusChangedParams } from '@kbn/agent-builder-common/telemetry/agent_builder_events';

const STATUS_FIELD = 'status';
const CLOSE_REASON_FIELD = 'close_reason';
const CLOSED = 'closed';
// Not `other`: templates use `other` as a real option (for example a close reason).
const UNRECOGNIZED = 'unrecognized';

/** The parts of a stored conversation a status change is computed from. */
export type ConversationStatusSnapshot = Pick<Conversation, 'id' | 'metadata' | 'template_id'>;

const getSelectOptions = (
  template: ConversationTemplate,
  field: string
): readonly string[] | undefined => {
  const definition = template.fields[field];
  return definition?.input_type === 'SELECT' ? definition.options ?? [] : undefined;
};

/** A stored select value as reported: one of the template's options, otherwise `unrecognized`. */
const toOption = (value: unknown, options: readonly string[]): string | undefined => {
  if (typeof value !== 'string' || value === '') {
    return undefined;
  }
  return options.includes(value) ? value : UNRECOGNIZED;
};

/**
 * Describes a change to the `status` field of a conversation whose template defines it as a
 * select field, for the `agent_builder_conversation_status_changed` event. Returns `undefined`
 * when the write didn't change the status, or the template has no status select field.
 *
 * Templates are registered by plugins in code, so template ids and select options are fixed
 * values, never customer content.
 */
export const describeConversationStatusChange = ({
  before,
  after,
  source,
  resolveTemplate,
}: {
  /** The stored conversation the write started from; omitted for a create. */
  before?: ConversationStatusSnapshot;
  after: ConversationStatusSnapshot;
  source: ConversationWriteSource;
  resolveTemplate: (templateId: string) => ConversationTemplate | undefined;
}): ReportConversationStatusChangedParams | undefined => {
  const { template_id: templateId } = after;
  if (!templateId) {
    return undefined;
  }
  const template = resolveTemplate(templateId);
  if (!template) {
    return undefined;
  }
  const statusOptions = getSelectOptions(template, STATUS_FIELD);
  if (!statusOptions) {
    return undefined;
  }

  const nextStatus = toOption(after.metadata?.[STATUS_FIELD], statusOptions);
  if (!nextStatus) {
    return undefined;
  }
  // A status carried over from a different template isn't a value of this one.
  const previousStatus =
    before && before.template_id === templateId
      ? toOption(before.metadata?.[STATUS_FIELD], statusOptions)
      : undefined;
  if (before && previousStatus === nextStatus) {
    return undefined;
  }

  // A select field can't be cleared, so a reopened conversation keeps its last close reason:
  // report it only with a close.
  const closeReasonOptions =
    nextStatus === CLOSED ? getSelectOptions(template, CLOSE_REASON_FIELD) : undefined;
  const closeReason = closeReasonOptions
    ? toOption(after.metadata?.[CLOSE_REASON_FIELD], closeReasonOptions)
    : undefined;

  return {
    conversation_id: after.id,
    template_id: templateId,
    ...(previousStatus ? { previous_status: previousStatus } : {}),
    next_status: nextStatus,
    ...(closeReason ? { close_reason: closeReason } : {}),
    source,
    change_kind: before ? 'updated' : 'created',
  };
};
