/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { MockedLogger } from '@kbn/logging-mocks';
import type {
  ConversationLifecycleCreatedEvent,
  ConversationLifecycleFilter,
  ConversationLifecycleMetadataUpdatedEvent,
} from '@kbn/agent-builder-server';
import { createConversationLifecycleService } from './conversation_lifecycle_service';

const flushListeners = () => new Promise((resolve) => setImmediate(resolve));

const investigationFilter: ConversationLifecycleFilter = {
  fields: ['status', 'severity'],
  templateIds: ['investigation'],
};

const buildEvent = (
  overrides: Partial<ConversationLifecycleMetadataUpdatedEvent> = {}
): ConversationLifecycleMetadataUpdatedEvent => ({
  changes: {
    severity: { next: 'high', previous: 'low' },
    status: { next: 'closed', previous: 'open' },
    summary: { next: 'private free text' },
  },
  conversationId: 'conv-1',
  source: { isTestRun: false, type: 'workflow', workflowExecutionId: 'exec-1', workflowId: 'wf-1' },
  spaceId: 'space-a',
  templateId: 'investigation',
  templateVersion: 2,
  ...overrides,
});

describe('createConversationLifecycleService', () => {
  let logger: MockedLogger;

  beforeEach(() => {
    logger = loggingSystemMock.createLogger();
  });

  const createService = () => createConversationLifecycleService({ logger });

  describe('setup', () => {
    it.each(['onCreated', 'onMetadataUpdated'] as const)(
      '%s throws when the filter lists no template id',
      (method) => {
        const setup = createService().setup();

        expect(() => setup[method]({ fields: ['status'], templateIds: [] }, jest.fn())).toThrow(
          /at least one template id/
        );
      }
    );

    it.each(['onCreated', 'onMetadataUpdated'] as const)(
      '%s accepts a filter with no fields',
      (method) => {
        const setup = createService().setup();

        expect(() =>
          setup[method]({ fields: [], templateIds: ['investigation'] }, jest.fn())
        ).not.toThrow();
      }
    );
  });

  describe('notifyCreated', () => {
    it('delivers the event, projected to the subscribed fields, to a matching listener', async () => {
      const service = createService();
      const listener = jest.fn();
      service.setup().onCreated(investigationFilter, listener);

      service.start().notifyCreated(buildEvent());
      await flushListeners();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        changes: {
          severity: { next: 'high', previous: 'low' },
          status: { next: 'closed', previous: 'open' },
        },
        conversationId: 'conv-1',
        source: {
          isTestRun: false,
          type: 'workflow',
          workflowExecutionId: 'exec-1',
          workflowId: 'wf-1',
        },
        spaceId: 'space-a',
        templateId: 'investigation',
        templateVersion: 2,
      });
    });

    it('does not deliver the event to a listener subscribed to another template', async () => {
      const service = createService();
      const listener = jest.fn();
      service.setup().onCreated({ fields: ['status'], templateIds: ['escalation'] }, listener);

      service.start().notifyCreated(buildEvent());
      await flushListeners();

      expect(listener).not.toHaveBeenCalled();
    });

    it('delivers the event with empty changes when no subscribed field has a value', async () => {
      const service = createService();
      const listener = jest.fn();
      service.setup().onCreated({ fields: ['assignee'], templateIds: ['investigation'] }, listener);

      service.start().notifyCreated(buildEvent());
      await flushListeners();

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ changes: {} }));
    });

    it('does not deliver created events to metadata updated listeners', async () => {
      const service = createService();
      const listener = jest.fn();
      service.setup().onMetadataUpdated(investigationFilter, listener);

      service.start().notifyCreated(buildEvent());
      await flushListeners();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('notifyMetadataUpdated', () => {
    it('delivers only the subscribed fields that changed', async () => {
      const service = createService();
      const listener = jest.fn();
      service
        .setup()
        .onMetadataUpdated({ fields: ['status'], templateIds: ['investigation'] }, listener);

      service.start().notifyMetadataUpdated(buildEvent());
      await flushListeners();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ changes: { status: { next: 'closed', previous: 'open' } } })
      );
    });

    it('does not call a listener when none of its fields changed', async () => {
      const service = createService();
      const listener = jest.fn();
      service
        .setup()
        .onMetadataUpdated({ fields: ['assignee'], templateIds: ['investigation'] }, listener);

      service.start().notifyMetadataUpdated(buildEvent());
      await flushListeners();

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not call a listener subscribed to another template', async () => {
      const service = createService();
      const listener = jest.fn();
      service
        .setup()
        .onMetadataUpdated({ fields: ['status'], templateIds: ['escalation'] }, listener);

      service.start().notifyMetadataUpdated(buildEvent());
      await flushListeners();

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not deliver metadata updated events to created listeners', async () => {
      const service = createService();
      const listener = jest.fn();
      service.setup().onCreated(investigationFilter, listener);

      service.start().notifyMetadataUpdated(buildEvent());
      await flushListeners();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('dispatch', () => {
    it('does not call listeners synchronously, so they never block the write', () => {
      const service = createService();
      const listener = jest.fn();
      service.setup().onCreated(investigationFilter, listener);

      service.start().notifyCreated(buildEvent());

      expect(listener).not.toHaveBeenCalled();
    });

    it('delivers to every matching listener, each with its own projection', async () => {
      const service = createService();
      const statusListener = jest.fn();
      const severityListener = jest.fn();
      const setup = service.setup();
      setup.onMetadataUpdated(
        { fields: ['status'], templateIds: ['investigation'] },
        statusListener
      );
      setup.onMetadataUpdated(
        { fields: ['severity'], templateIds: ['escalation', 'investigation'] },
        severityListener
      );

      service.start().notifyMetadataUpdated(buildEvent());
      await flushListeners();

      expect(statusListener).toHaveBeenCalledWith(
        expect.objectContaining({ changes: { status: { next: 'closed', previous: 'open' } } })
      );
      expect(severityListener).toHaveBeenCalledWith(
        expect.objectContaining({ changes: { severity: { next: 'high', previous: 'low' } } })
      );
    });

    it('isolates listeners from each other and from the producer', async () => {
      const service = createService();
      const event = buildEvent();
      const tamper = jest.fn((delivered: ConversationLifecycleCreatedEvent) => {
        (delivered.source as { type: string }).type = 'http_api';
        delivered.changes.status.next = 'tampered';
      });
      const observe = jest.fn();
      const setup = service.setup();
      setup.onCreated(investigationFilter, tamper);
      setup.onCreated(investigationFilter, observe);

      service.start().notifyCreated(event);
      await flushListeners();

      expect(tamper).toHaveBeenCalledTimes(1);
      const [observed] = observe.mock.calls[0];
      expect(observed.source.type).toBe('workflow');
      expect(observed.changes.status.next).toBe('closed');
      expect(event.source.type).toBe('workflow');
      expect(event.changes.status.next).toBe('closed');
    });

    it('is not affected by changes to the filter after registration', async () => {
      const service = createService();
      const listener = jest.fn();
      const templateIds = ['investigation'];
      const fields = ['status'];
      service.setup().onMetadataUpdated({ fields, templateIds }, listener);
      templateIds.push('escalation');
      fields.push('summary');

      service.start().notifyMetadataUpdated(buildEvent({ templateId: 'escalation' }));
      service.start().notifyMetadataUpdated(buildEvent());
      await flushListeners();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ changes: { status: { next: 'closed', previous: 'open' } } })
      );
    });

    it('logs a listener that throws and still delivers to the others', async () => {
      const service = createService();
      const healthy = jest.fn();
      const setup = service.setup();
      setup.onCreated(investigationFilter, () => {
        throw new Error('listener exploded');
      });
      setup.onCreated(investigationFilter, healthy);

      expect(() => service.start().notifyCreated(buildEvent())).not.toThrow();
      await flushListeners();

      expect(healthy).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Conversation lifecycle "created" listener failed for conversation "conv-1": Error: listener exploded'
      );
    });

    it('logs a listener that rejects without leaking an unhandled rejection', async () => {
      const service = createService();
      service
        .setup()
        .onMetadataUpdated(investigationFilter, () => Promise.reject(new Error('async boom')));

      service.start().notifyMetadataUpdated(buildEvent());
      await flushListeners();

      expect(logger.warn).toHaveBeenCalledWith(
        'Conversation lifecycle "metadata_updated" listener failed for conversation "conv-1": Error: async boom'
      );
    });

    it('does nothing when there are no listeners', () => {
      const service = createService();

      expect(() => service.start().notifyCreated(buildEvent())).not.toThrow();
      expect(() => service.start().notifyMetadataUpdated(buildEvent())).not.toThrow();
    });
  });
});
