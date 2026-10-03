/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { INVESTIGATION_TEMPLATE_ID } from '../../../common/escalations/constants';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS } from '../../telemetry';
import {
  InvestigationStatusService,
  ProposalDismissFailedError,
} from './investigation_status_service';

const request = httpServerMock.createKibanaRequest();
const INVESTIGATION_ID = '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f';
const CREATED_AT = '2026-09-28T11:00:00.000Z';
const NOW = Date.parse('2026-09-28T12:00:00.000Z');

const makeService = ({
  changedFields = ['status'],
  closeReason,
  patchError,
  pendingIds = [],
  previousStatus = 'open',
  releaseGateError,
  spaceId = 'default',
}: {
  changedFields?: string[];
  closeReason?: string;
  patchError?: Error;
  pendingIds?: string[];
  /** `null` stores no status at all. */
  previousStatus?: string | null;
  releaseGateError?: Error;
  spaceId?: string;
} = {}) => {
  const logger = loggingSystemMock.createLogger();
  const conversation = {
    created_at: CREATED_AT,
    id: INVESTIGATION_ID,
    metadata: {
      ...(previousStatus !== null ? { status: previousStatus } : {}),
      ...(closeReason !== undefined ? { close_reason: closeReason } : {}),
      summary: 'Free-text summary that must never ship',
      verdict: 'Free-text verdict that must never ship',
    },
    template_id: INVESTIGATION_TEMPLATE_ID,
    title: 'Investigation title that must never ship',
  };
  const proposalsService = {
    get: jest.fn().mockResolvedValue({ status: 'pending', expired: false }),
    list: jest.fn().mockResolvedValue({
      proposals: pendingIds.map((id) => ({ id })),
      total: pendingIds.length,
    }),
    releaseGate: releaseGateError
      ? jest.fn().mockRejectedValue(releaseGateError)
      : jest.fn().mockResolvedValue({}),
  };
  const proposals = {
    getProposalPrivileges: () => ({
      assertCanManage: jest.fn().mockResolvedValue(undefined),
      assertCanRead: jest.fn().mockResolvedValue(undefined),
    }),
    getProposalsService: () => proposalsService,
  };
  const client = {
    get: jest.fn().mockResolvedValue(conversation),
    patchMetadata: patchError
      ? jest.fn().mockRejectedValue(patchError)
      : jest.fn().mockImplementation(async (_id: string, updates: Record<string, string>) => ({
          changedFields,
          conversation: { ...conversation, metadata: { ...conversation.metadata, ...updates } },
        })),
  };
  const telemetry = jest.fn();
  const service = new InvestigationStatusService({
    getConversationClient: jest.fn().mockResolvedValue(client),
    getProposals: jest.fn().mockReturnValue(proposals),
    getSpaceId: jest.fn().mockReturnValue(spaceId),
    logger,
    telemetry,
  });

  return { client, logger, service, telemetry };
};

describe('InvestigationStatusService.setStatus telemetry', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports a human close after the write, classed as user', async () => {
    const { client, service, telemetry } = makeService({ pendingIds: ['p-1', 'p-2'] });

    await service.setStatus(request, INVESTIGATION_ID, {
      dismiss_reason: 'insufficient_evidence',
      status: 'closed',
    });

    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(telemetry).toHaveBeenCalledWith(
      AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed,
      {
        closed_by_class: 'user',
        dismiss_reason: 'insufficient_evidence',
        investigation_id: INVESTIGATION_ID,
        is_default_space: true,
        proposals_open_at_close: 2,
        time_open_ms: 3_600_000,
      }
    );
    expect(telemetry.mock.invocationCallOrder[0]).toBeGreaterThan(
      client.patchMetadata.mock.invocationCallOrder[0]
    );
  });

  it('classes a close requested by the escalation cascade', async () => {
    const { service, telemetry } = makeService();

    await service.setStatus(
      request,
      INVESTIGATION_ID,
      { status: 'closed' },
      { closedBy: 'escalation_cascade' }
    );

    expect(telemetry).toHaveBeenCalledWith(
      AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed,
      expect.objectContaining({ closed_by_class: 'escalation_cascade' })
    );
  });

  it('ships the template close reason stored on the investigation', async () => {
    const { service, telemetry } = makeService({ closeReason: 'resolved' });

    await service.setStatus(request, INVESTIGATION_ID, { status: 'closed' });

    expect(telemetry).toHaveBeenCalledWith(
      AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed,
      expect.objectContaining({ close_reason: 'resolved' })
    );
  });

  it('reports a reopen', async () => {
    const { service, telemetry } = makeService({ previousStatus: 'closed' });

    await service.setStatus(request, INVESTIGATION_ID, { status: 'open' });

    expect(telemetry).toHaveBeenCalledWith(
      AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened,
      { investigation_id: INVESTIGATION_ID, is_default_space: true }
    );
  });

  it('reports an open of an investigation that had no status', async () => {
    const { service, telemetry } = makeService({ previousStatus: null, spaceId: 'team-a' });

    await service.setStatus(request, INVESTIGATION_ID, { status: 'open' });

    expect(telemetry).toHaveBeenCalledWith(
      AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationOpened,
      { investigation_id: INVESTIGATION_ID, is_default_space: false }
    );
  });

  it('reports nothing when the write changed nothing', async () => {
    const { service, telemetry } = makeService({ changedFields: [], previousStatus: 'closed' });

    await service.setStatus(request, INVESTIGATION_ID, { status: 'closed' });

    expect(telemetry).not.toHaveBeenCalled();
  });

  it('reports nothing when the write fails', async () => {
    const { service, telemetry } = makeService({ patchError: new Error('version conflict') });

    await expect(
      service.setStatus(request, INVESTIGATION_ID, { status: 'closed' })
    ).rejects.toThrow('version conflict');
    expect(telemetry).not.toHaveBeenCalled();
  });

  it('reports nothing when proposals could not be dismissed', async () => {
    const { service, telemetry } = makeService({
      pendingIds: ['p-1'],
      releaseGateError: new Error('boom'),
    });

    await expect(
      service.setStatus(request, INVESTIGATION_ID, { dismiss_reason: 'wrong', status: 'closed' })
    ).rejects.toBeInstanceOf(ProposalDismissFailedError);
    expect(telemetry).not.toHaveBeenCalled();
  });

  it('never ships the space id, title, summary or verdict', async () => {
    const { service, telemetry } = makeService({ spaceId: 'secret-space' });

    await service.setStatus(request, INVESTIGATION_ID, { status: 'closed' });

    expect(JSON.stringify(telemetry.mock.calls)).not.toMatch(/secret-space|must never ship/);
  });

  it('does not fail the close when the reporter throws', async () => {
    const { service, telemetry } = makeService();
    telemetry.mockImplementation(() => {
      throw new Error('Attempted to report event type before registering it');
    });

    await expect(
      service.setStatus(request, INVESTIGATION_ID, { status: 'closed' })
    ).resolves.toEqual(expect.objectContaining({ status: 'closed' }));
  });

  it('closes without a reporter configured', async () => {
    const { client } = makeService();
    const service = new InvestigationStatusService({
      getConversationClient: jest.fn().mockResolvedValue(client),
      getProposals: jest.fn().mockReturnValue(undefined),
      getSpaceId: jest.fn().mockReturnValue('default'),
      logger: loggingSystemMock.createLogger(),
    });

    await expect(
      service.setStatus(request, INVESTIGATION_ID, { status: 'closed' })
    ).resolves.toEqual(expect.objectContaining({ status: 'closed' }));
  });
});
