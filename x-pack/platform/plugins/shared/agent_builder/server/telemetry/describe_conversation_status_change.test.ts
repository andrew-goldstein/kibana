/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationTemplate } from '@kbn/agent-builder-common';
import {
  describeConversationStatusChange,
  type ConversationStatusSnapshot,
} from './describe_conversation_status_change';

const investigation: ConversationTemplate = {
  id: 'investigation',
  version: 1,
  name: 'Investigation',
  fields: {
    status: { input_type: 'SELECT', options: ['open', 'closed'] },
    close_reason: { input_type: 'SELECT', options: ['false_positive', 'benign', 'other'] },
    verdict: { input_type: 'TEXT' },
  },
};

const notes: ConversationTemplate = {
  id: 'notes',
  version: 1,
  name: 'Notes',
  fields: { status: { input_type: 'TEXT' } },
};

const resolveTemplate = (templateId: string): ConversationTemplate | undefined =>
  [investigation, notes].find(({ id }) => id === templateId);

const snapshot = (
  metadata: ConversationStatusSnapshot['metadata'],
  templateId: string | null = 'investigation'
): ConversationStatusSnapshot => ({
  id: 'conversation-1',
  metadata,
  ...(templateId ? { template_id: templateId } : {}),
});

describe('describeConversationStatusChange', () => {
  it('describes a close, with the previous status and the close reason', () => {
    expect(
      describeConversationStatusChange({
        before: snapshot({ status: 'open' }),
        after: snapshot({ status: 'closed', close_reason: 'benign', verdict: 'free text' }),
        source: 'execution',
        resolveTemplate,
      })
    ).toEqual({
      conversation_id: 'conversation-1',
      template_id: 'investigation',
      previous_status: 'open',
      next_status: 'closed',
      close_reason: 'benign',
      source: 'execution',
      change_kind: 'updated',
    });
  });

  it('describes a reopen without the close reason the conversation keeps', () => {
    expect(
      describeConversationStatusChange({
        before: snapshot({ status: 'closed', close_reason: 'benign' }),
        after: snapshot({ status: 'open', close_reason: 'benign' }),
        source: 'server_api',
        resolveTemplate,
      })
    ).toEqual({
      conversation_id: 'conversation-1',
      template_id: 'investigation',
      previous_status: 'closed',
      next_status: 'open',
      source: 'server_api',
      change_kind: 'updated',
    });
  });

  it('describes a create with no previous status', () => {
    expect(
      describeConversationStatusChange({
        after: snapshot({ status: 'open' }),
        source: 'workflow',
        resolveTemplate,
      })
    ).toEqual({
      conversation_id: 'conversation-1',
      template_id: 'investigation',
      next_status: 'open',
      source: 'workflow',
      change_kind: 'created',
    });
  });

  it('returns undefined when the status did not change', () => {
    expect(
      describeConversationStatusChange({
        before: snapshot({ status: 'closed', close_reason: 'benign' }),
        after: snapshot({ status: 'closed', close_reason: 'other' }),
        source: 'http_api',
        resolveTemplate,
      })
    ).toBeUndefined();
  });

  it('reports a status a template change carries over as a change with no previous status', () => {
    expect(
      describeConversationStatusChange({
        before: snapshot({ status: 'open' }, 'notes'),
        after: snapshot({ status: 'open' }),
        source: 'http_api',
        resolveTemplate,
      })
    ).toEqual({
      conversation_id: 'conversation-1',
      template_id: 'investigation',
      next_status: 'open',
      source: 'http_api',
      change_kind: 'updated',
    });
  });

  it('reports a status outside the options as unrecognized, not as the real option other', () => {
    expect(
      describeConversationStatusChange({
        before: snapshot({ status: 'open' }),
        after: snapshot({ status: 'archived', close_reason: 'benign' }),
        source: 'http_api',
        resolveTemplate,
      })
    ).toEqual(expect.objectContaining({ next_status: 'unrecognized', previous_status: 'open' }));
  });

  it('reports a close reason outside the options as unrecognized, and other as other', () => {
    const closeWith = (closeReason: string) =>
      describeConversationStatusChange({
        before: snapshot({ status: 'open' }),
        after: snapshot({ status: 'closed', close_reason: closeReason }),
        source: 'http_api',
        resolveTemplate,
      });

    expect(closeWith('gone fishing')).toEqual(
      expect.objectContaining({ close_reason: 'unrecognized' })
    );
    expect(closeWith('other')).toEqual(expect.objectContaining({ close_reason: 'other' }));
  });

  it('returns undefined without a template, an unknown template or a select status field', () => {
    const write = (after: ConversationStatusSnapshot) =>
      describeConversationStatusChange({
        before: { ...after, metadata: {} },
        after,
        source: 'http_api',
        resolveTemplate,
      });

    expect(write(snapshot({ status: 'closed' }, null))).toBeUndefined();
    expect(write(snapshot({ status: 'closed' }, 'unknown'))).toBeUndefined();
    expect(write(snapshot({ status: 'closed' }, 'notes'))).toBeUndefined();
  });

  it('returns undefined when the status is unset after the write', () => {
    expect(
      describeConversationStatusChange({
        before: snapshot({ status: 'open' }),
        after: snapshot({}),
        source: 'http_api',
        resolveTemplate,
      })
    ).toBeUndefined();
  });
});
