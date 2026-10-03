/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationLifecycleSetup } from '@kbn/agent-builder-server';
import { loggerMock } from '@kbn/logging-mocks';
import { INVESTIGATION_LIFECYCLE_FILTER } from './constants';
import { subscribeInvestigationLifecycle } from './subscribe_investigation_lifecycle';

const createConversationLifecycle = (): jest.Mocked<ConversationLifecycleSetup> => ({
  onCreated: jest.fn(),
  onMetadataUpdated: jest.fn(),
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('subscribeInvestigationLifecycle', () => {
  it('subscribes to the investigation template status, severity and close reason only', () => {
    const conversationLifecycle = createConversationLifecycle();

    subscribeInvestigationLifecycle({
      conversationLifecycle,
      getManagedWorkflowState: async () => undefined,
      logger: loggerMock.create(),
      reporter: jest.fn(),
    });

    expect(INVESTIGATION_LIFECYCLE_FILTER).toEqual({
      fields: ['status', 'severity', 'close_reason'],
      templateIds: ['investigation'],
    });
    expect(conversationLifecycle.onCreated).toHaveBeenCalledWith(
      INVESTIGATION_LIFECYCLE_FILTER,
      expect.any(Function)
    );
    expect(conversationLifecycle.onMetadataUpdated).toHaveBeenCalledWith(
      INVESTIGATION_LIFECYCLE_FILTER,
      expect.any(Function)
    );
  });

  it('never subscribes to a free-text field', () => {
    expect(
      INVESTIGATION_LIFECYCLE_FILTER.fields.filter((field) =>
        ['assignees', 'description', 'summary', 'verdict', 'workflow_execution_id'].includes(field)
      )
    ).toEqual([]);
  });

  it('stops the registered listeners', async () => {
    const conversationLifecycle = createConversationLifecycle();
    const reporter = jest.fn();
    const subscription = subscribeInvestigationLifecycle({
      conversationLifecycle,
      getManagedWorkflowState: async () => undefined,
      logger: loggerMock.create(),
      reporter,
    });
    const [[, onCreated]] = conversationLifecycle.onCreated.mock.calls;

    subscription.stop();
    await onCreated({
      changes: {},
      conversationId: 'conv-1',
      source: { type: 'http_api' },
      spaceId: 'default',
      templateId: 'investigation',
    });
    await flush();

    expect(reporter).not.toHaveBeenCalled();
  });
});
