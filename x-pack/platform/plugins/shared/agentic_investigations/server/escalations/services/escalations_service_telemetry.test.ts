/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import {
  ESCALATION_LINKED_INVESTIGATIONS_FIELD,
  ESCALATION_STATUS_FIELD,
  ESCALATION_TEMPLATE_ID,
  INVESTIGATION_TEMPLATE_ID,
} from '../../../common/escalations/constants';
import { InvestigationStatusService } from '../../investigations/services/investigation_status_service';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from '../../telemetry';
import { EscalationCloseIncompleteError } from './escalation_close_incomplete_error';
import { EscalationsService } from './escalations_service';

const request = httpServerMock.createKibanaRequest();
const ESCALATION_ID = '9a7b6c5d-4e3f-4a1b-8c2d-0e1f2a3b4c5d';
const NOW = Date.parse('2026-09-28T12:00:00.000Z');

const ESCALATION_TEMPLATE = {
  fields: {
    close_reason: { input_type: 'SELECT', options: ['false_positive', 'other'] },
    linked_investigations: { input_type: 'TEXT_ARRAY' },
    severity: { input_type: 'SELECT', options: ['low', 'high'] },
    status: { default_value: 'open', input_type: 'SELECT', options: ['open', 'closed'] },
  },
  id: ESCALATION_TEMPLATE_ID,
  version: 1,
};

interface StoredConversation {
  created_at: string;
  id: string;
  metadata: Record<string, string | string[]>;
  template_id: string;
  title: string;
}

const investigation = (id: string, status = 'open'): StoredConversation => ({
  created_at: '2026-09-28T11:00:00.000Z',
  id,
  metadata: { severity: 'high', status, summary: 'Free-text summary that must never ship' },
  template_id: INVESTIGATION_TEMPLATE_ID,
  title: `Investigation ${id} title that must never ship`,
});

const escalation = (linked: string[], status = 'open'): StoredConversation => ({
  created_at: '2026-09-27T12:00:00.000Z',
  id: ESCALATION_ID,
  metadata: { [ESCALATION_LINKED_INVESTIGATIONS_FIELD]: linked, [ESCALATION_STATUS_FIELD]: status },
  template_id: ESCALATION_TEMPLATE_ID,
  title: 'Escalation title that must never ship',
});

/**
 * A conversation client over an in-memory store. `patchMetadata` reports the fields it really
 * changed, as Agent Builder does, and rejects for the ids in `failPatchIds`.
 */
const makeClient = ({
  conversations,
  failPatchIds = [],
}: {
  conversations: StoredConversation[];
  failPatchIds?: string[];
}) => {
  const store = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  return {
    bulkGet: jest.fn(
      async (ids: string[]) =>
        new Map(
          ids.flatMap((id) => {
            const conversation = store.get(id);
            return conversation ? [[id, conversation] as const] : [];
          })
        )
    ),
    create: jest.fn(async ({ metadata, templateId, title }) => ({
      created_at: new Date(NOW).toISOString(),
      id: ESCALATION_ID,
      metadata,
      template_id: templateId,
      title,
    })),
    get: jest.fn(async (id: string) => {
      const conversation = store.get(id);
      if (!conversation) {
        throw new Error(`Conversation ${id} not found`);
      }
      return conversation;
    }),
    patchMetadata: jest.fn(async (id: string, updates: Record<string, string | string[]>) => {
      if (failPatchIds.includes(id)) {
        throw new Error(`Failed to patch ${id}`);
      }
      const current = store.get(id);
      if (!current) {
        throw new Error(`Conversation ${id} not found`);
      }
      const changedFields = Object.keys(updates).filter(
        (key) => JSON.stringify(current.metadata[key]) !== JSON.stringify(updates[key])
      );
      const next = { ...current, metadata: { ...current.metadata, ...updates } };
      store.set(id, next);
      return { changedFields, conversation: next };
    }),
    update: jest.fn(async ({ title }: { title: string }) => ({
      ...escalation([]),
      title,
    })),
  };
};

/** Wires a real InvestigationStatusService into the EscalationsService, sharing one reporter. */
const makeServices = ({
  conversations,
  failPatchIds,
  spaceId = 'default',
}: {
  conversations: StoredConversation[];
  failPatchIds?: string[];
  spaceId?: string;
}) => {
  const logger = loggingSystemMock.createLogger();
  const client = makeClient({ conversations, failPatchIds });
  const getConversationClient = jest.fn().mockResolvedValue(client);
  const telemetry = jest.fn();
  const getSpaceId = jest.fn().mockReturnValue(spaceId);
  const investigationStatusService = new InvestigationStatusService({
    getConversationClient,
    getProposals: () => undefined,
    getSpaceId,
    logger,
    telemetry,
  });
  const service = new EscalationsService({
    conversationTemplates: {
      get: jest.fn().mockResolvedValue(ESCALATION_TEMPLATE),
      list: jest.fn(),
    } as never,
    getConversationClient,
    getInvestigationStatusService: () => investigationStatusService,
    getSpaceId,
    logger,
    telemetry,
  });

  return { client, investigationStatusService, service, telemetry };
};

const callsOf = (telemetry: jest.Mock, eventType: string) =>
  telemetry.mock.calls.filter(([type]) => type === eventType).map(([, payload]) => payload);

describe('EscalationsService telemetry', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('create', () => {
    it('reports the created escalation after the write', async () => {
      const { client, service, telemetry } = makeServices({
        conversations: [investigation('inv-1')],
      });

      await service.create(request, {
        assignees: ['user-b', 'user-c'],
        collaborators: ['user-a', 'user-b'],
        linked_investigation_id: 'inv-1',
        visibility: 'private',
      });

      expect(telemetry).toHaveBeenCalledTimes(1);
      expect(telemetry).toHaveBeenCalledWith(
        AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationCreated,
        {
          access_mode: 'private',
          escalation_id: ESCALATION_ID,
          investigation_id: 'inv-1',
          is_default_space: true,
          linked_investigations_at_create: 1,
          participant_count: 3,
        }
      );
      expect(telemetry.mock.invocationCallOrder[0]).toBeGreaterThan(
        client.create.mock.invocationCallOrder[0]
      );
    });

    it('reports a public escalation in a non-default space', async () => {
      const { service, telemetry } = makeServices({
        conversations: [investigation('inv-1')],
        spaceId: 'secret-space',
      });

      await service.create(request, {
        collaborators: [],
        linked_investigation_id: 'inv-1',
        visibility: 'public',
      });

      expect(telemetry).toHaveBeenCalledWith(
        AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationCreated,
        expect.objectContaining({
          access_mode: 'public',
          is_default_space: false,
          participant_count: 0,
        })
      );
      expect(JSON.stringify(telemetry.mock.calls)).not.toMatch(/secret-space|must never ship/);
    });

    it('reports nothing when the create fails', async () => {
      const { client, service, telemetry } = makeServices({
        conversations: [investigation('inv-1')],
      });
      client.create.mockRejectedValueOnce(new Error('create failed'));

      await expect(
        service.create(request, {
          collaborators: [],
          linked_investigation_id: 'inv-1',
          visibility: 'public',
        })
      ).rejects.toThrow('create failed');
      expect(telemetry).not.toHaveBeenCalled();
    });

    it('does not fail the create when the reporter throws', async () => {
      const { service, telemetry } = makeServices({ conversations: [investigation('inv-1')] });
      telemetry.mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(
        service.create(request, {
          collaborators: [],
          linked_investigation_id: 'inv-1',
          visibility: 'public',
        })
      ).resolves.toEqual(expect.objectContaining({ id: ESCALATION_ID }));
    });
  });

  describe('update (link)', () => {
    it('reports one event per newly linked investigation', async () => {
      const { service, telemetry } = makeServices({
        conversations: [
          escalation(['inv-1']),
          investigation('inv-1'),
          investigation('inv-2'),
          investigation('inv-3'),
        ],
      });

      await service.update(request, ESCALATION_ID, {
        linked_investigations: ['inv-1', 'inv-2', 'inv-3', 'inv-2'],
      });

      expect(
        callsOf(telemetry, AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationInvestigationLinked)
      ).toEqual([
        {
          escalation_id: ESCALATION_ID,
          investigation_id: 'inv-2',
          is_default_space: true,
          linked_investigation_count: 3,
        },
        {
          escalation_id: ESCALATION_ID,
          investigation_id: 'inv-3',
          is_default_space: true,
          linked_investigation_count: 3,
        },
      ]);
    });

    it('reports nothing when every id was already linked', async () => {
      const { service, telemetry } = makeServices({
        conversations: [escalation(['inv-1']), investigation('inv-1')],
      });

      await service.update(request, ESCALATION_ID, { linked_investigations: ['inv-1'] });

      expect(telemetry).not.toHaveBeenCalled();
    });

    it('reports nothing for a title-only update', async () => {
      const { service, telemetry } = makeServices({ conversations: [escalation([])] });

      await service.update(request, ESCALATION_ID, { title: 'Renamed' });

      expect(telemetry).not.toHaveBeenCalled();
    });

    it('does not fail the link when the reporter throws', async () => {
      const { service, telemetry } = makeServices({
        conversations: [escalation([]), investigation('inv-1')],
      });
      telemetry.mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(
        service.update(request, ESCALATION_ID, { linked_investigations: ['inv-1'] })
      ).resolves.toEqual(expect.objectContaining({ id: ESCALATION_ID }));
    });
  });

  describe('setStatus (close cascade)', () => {
    it('reports one escalation_cascade close per investigation closed, then the escalation close', async () => {
      const { service, telemetry } = makeServices({
        conversations: [
          escalation(['inv-1', 'inv-2', 'inv-3']),
          investigation('inv-1'),
          investigation('inv-2'),
          investigation('inv-3', 'closed'),
        ],
      });

      await service.setStatus(request, ESCALATION_ID, { status: 'closed' });

      const investigationCloses = callsOf(
        telemetry,
        AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed
      );
      expect(investigationCloses).toHaveLength(2);
      expect(investigationCloses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            closed_by_class: 'escalation_cascade',
            investigation_id: 'inv-1',
          }),
          expect.objectContaining({
            closed_by_class: 'escalation_cascade',
            investigation_id: 'inv-2',
          }),
        ])
      );
      expect(callsOf(telemetry, AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed)).toEqual([
        {
          escalation_id: ESCALATION_ID,
          investigations_closed: 2,
          is_default_space: true,
          linked_investigation_count: 3,
          time_open_ms: 86_400_000,
        },
      ]);
    });

    it('reports only the investigations that really closed when the cascade is incomplete', async () => {
      const { service, telemetry } = makeServices({
        conversations: [
          escalation(['inv-1', 'inv-2', 'inv-3']),
          investigation('inv-1'),
          investigation('inv-2'),
          investigation('inv-3'),
        ],
        failPatchIds: ['inv-2'],
      });

      await expect(
        service.setStatus(request, ESCALATION_ID, { status: 'closed' })
      ).rejects.toBeInstanceOf(EscalationCloseIncompleteError);

      const investigationCloses = callsOf(
        telemetry,
        AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed
      );
      expect(investigationCloses.map(({ investigation_id: id }) => id).sort()).toEqual([
        'inv-1',
        'inv-3',
      ]);
      expect(
        investigationCloses.every(
          ({ closed_by_class: closedBy }) => closedBy === 'escalation_cascade'
        )
      ).toBe(true);
      expect(callsOf(telemetry, AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed)).toEqual(
        []
      );
    });

    it('reports a close of an escalation with no linked investigations', async () => {
      const { service, telemetry } = makeServices({ conversations: [escalation([])] });

      await service.setStatus(request, ESCALATION_ID, { status: 'closed' });

      expect(telemetry).toHaveBeenCalledTimes(1);
      expect(telemetry).toHaveBeenCalledWith(
        AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed,
        expect.objectContaining({ investigations_closed: 0, linked_investigation_count: 0 })
      );
    });

    it('reports nothing when the escalation was already closed', async () => {
      const { service, telemetry } = makeServices({
        conversations: [escalation([], 'closed')],
      });

      await service.setStatus(request, ESCALATION_ID, { status: 'closed' });

      expect(telemetry).not.toHaveBeenCalled();
    });

    it('reports nothing when the escalation is reopened', async () => {
      const { service, telemetry } = makeServices({
        conversations: [escalation([], 'closed')],
      });

      await service.setStatus(request, ESCALATION_ID, { status: 'open' });

      expect(telemetry).not.toHaveBeenCalled();
    });

    it('never ships titles, summaries or the space id', async () => {
      const { service, telemetry } = makeServices({
        conversations: [escalation(['inv-1']), investigation('inv-1')],
        spaceId: 'secret-space',
      });

      await service.setStatus(request, ESCALATION_ID, { status: 'closed' });

      expect(telemetry).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(telemetry.mock.calls)).not.toMatch(/secret-space|must never ship/);
    });

    it('does not fail the close when the reporter throws', async () => {
      const { service, telemetry } = makeServices({
        conversations: [escalation(['inv-1']), investigation('inv-1')],
      });
      telemetry.mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(
        service.setStatus(request, ESCALATION_ID, { status: 'closed' })
      ).resolves.toEqual(
        expect.objectContaining({ closed_investigation_ids: ['inv-1'], status: 'closed' })
      );
    });
  });
});
