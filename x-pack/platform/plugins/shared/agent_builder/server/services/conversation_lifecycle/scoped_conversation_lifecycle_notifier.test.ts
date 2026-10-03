/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createScopedConversationLifecycleNotifier } from './scoped_conversation_lifecycle_notifier';

describe('createScopedConversationLifecycleNotifier', () => {
  const notification = {
    changes: { status: { next: 'open' } },
    conversationId: 'conv-1',
    templateId: 'investigation',
    templateVersion: 1,
  };

  const createLifecycleStart = () => ({
    notifyCreated: jest.fn(),
    notifyMetadataUpdated: jest.fn(),
  });

  it('binds the source and space to created notifications', () => {
    const lifecycle = createLifecycleStart();
    const notifier = createScopedConversationLifecycleNotifier(lifecycle, {
      source: { type: 'http_api' },
      spaceId: 'space-a',
    });

    notifier.notifyCreated(notification);

    expect(lifecycle.notifyCreated).toHaveBeenCalledWith({
      ...notification,
      source: { type: 'http_api' },
      spaceId: 'space-a',
    });
    expect(lifecycle.notifyMetadataUpdated).not.toHaveBeenCalled();
  });

  it('binds the source and space to metadata updated notifications', () => {
    const lifecycle = createLifecycleStart();
    const source = {
      isTestRun: true,
      type: 'workflow' as const,
      workflowExecutionId: 'exec-1',
      workflowId: 'wf-1',
    };
    const notifier = createScopedConversationLifecycleNotifier(lifecycle, {
      source,
      spaceId: 'space-b',
    });

    notifier.notifyMetadataUpdated(notification);

    expect(lifecycle.notifyMetadataUpdated).toHaveBeenCalledWith({
      ...notification,
      source,
      spaceId: 'space-b',
    });
    expect(lifecycle.notifyCreated).not.toHaveBeenCalled();
  });

  it('ignores a source or space smuggled into the notification', () => {
    const lifecycle = createLifecycleStart();
    const notifier = createScopedConversationLifecycleNotifier(lifecycle, {
      source: { type: 'execution' },
      spaceId: 'space-a',
    });

    notifier.notifyCreated({
      ...notification,
      source: { type: 'server_api' },
      spaceId: 'space-z',
    } as unknown as typeof notification);

    expect(lifecycle.notifyCreated).toHaveBeenCalledWith(
      expect.objectContaining({ source: { type: 'execution' }, spaceId: 'space-a' })
    );
  });
});
