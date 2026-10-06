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
import type { ReportConversationFieldChangedParams } from '@kbn/agent-builder-common/telemetry/agent_builder_events';

/** Reported for a stored value that isn't one of the field's options. Not `other`: templates use `other` as a real option. */
export const UNRECOGNIZED_FIELD_VALUE = 'unrecognized';

/** The parts of a stored conversation the field changes are computed from. */
export type ConversationFieldSnapshot = Pick<Conversation, 'id' | 'metadata' | 'template_id'>;

interface ReportedField {
  readonly name: string;
  readonly options: readonly string[];
}

/** The template's SELECT fields that opt in with `report_changes`, in declaration order. */
const getReportedFields = (template: ConversationTemplate): ReportedField[] =>
  Object.entries(template.fields).flatMap(
    ([name, { input_type: inputType, options, report_changes: reportChanges }]) =>
      reportChanges === true && inputType === 'SELECT' ? [{ name, options: options ?? [] }] : []
  );

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

const isSameStoredValue = (previous: unknown, next: unknown): boolean =>
  (isEmpty(previous) && isEmpty(next)) || JSON.stringify(previous) === JSON.stringify(next);

/** A stored value as reported: absent when empty, one of the field's options, otherwise `unrecognized`. */
const toReportedValue = (value: unknown, options: readonly string[]): string | undefined => {
  if (isEmpty(value)) {
    return undefined;
  }
  return typeof value === 'string' && options.includes(value) ? value : UNRECOGNIZED_FIELD_VALUE;
};

/**
 * Describes each `report_changes` field whose stored value a write changed, for the
 * `agent_builder_conversation_field_changed` event. Returns an empty array when the conversation
 * has no registered template, or the write changed none of its reported fields.
 *
 * Only SELECT fields are reported, and their values are the template's options (or
 * `unrecognized`), so no free text is ever sent.
 */
export const describeConversationFieldChanges = ({
  after,
  before,
  resolveTemplate,
  source,
}: {
  after: ConversationFieldSnapshot;
  /** The stored conversation the write started from; omitted for a create. */
  before?: ConversationFieldSnapshot;
  resolveTemplate: (templateId: string) => ConversationTemplate | undefined;
  source: ConversationWriteSource;
}): ReportConversationFieldChangedParams[] => {
  const { id: conversationId, metadata: nextMetadata, template_id: templateId } = after;
  const template = templateId ? resolveTemplate(templateId) : undefined;
  if (!templateId || !template) {
    return [];
  }

  // Values stored under a different template aren't values of this one, so a write that applies
  // the template reports no previous values, like a create.
  const previousMetadata = before?.template_id === templateId ? before.metadata : undefined;
  const changeKind = before ? 'updated' : 'created';

  return getReportedFields(template).flatMap(({ name, options }) => {
    const previousStored = previousMetadata?.[name];
    const nextStored = nextMetadata?.[name];
    if (isSameStoredValue(previousStored, nextStored)) {
      return [];
    }

    const previousValue = toReportedValue(previousStored, options);
    const nextValue = toReportedValue(nextStored, options);
    return [
      {
        conversation_id: conversationId,
        template_id: templateId,
        field: name,
        ...(previousValue ? { previous_value: previousValue } : {}),
        ...(nextValue ? { next_value: nextValue } : {}),
        source,
        change_kind: changeKind,
      },
    ];
  });
};
