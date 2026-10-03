/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAnalytics } from '@elastic/ebt/client';
import { loggerMock } from '@kbn/logging-mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { ExecutionStatus } from '@kbn/workflows';
import type { CreateProposalRequest } from '@kbn/proposals-common';
import type { ProposalDocument, ProposalsStorageClient } from '../storage/proposals_storage';
import type { ProposalsTelemetryAnalytics } from '../telemetry';
import {
  createProposalsTelemetryReporter,
  PROPOSALS_TELEMETRY_EVENTS,
  registerProposalsTelemetryEvents,
} from '../telemetry';
import { ProposalConflictError } from './errors';
import { ProposalsService } from './proposals_service';

const SPACE_ID = 'space-a';
const EXECUTION_ID = 'exec-1';
const CREATED_AT = '2026-09-01T00:00:00.000Z';
const request = httpServerMock.createKibanaRequest();

/** The caller fields a document from `storedDocument()` resolves to. */
const CALLER_FIELDS = {
  caller_run_id: 'exec-root',
  consumer: 'alertzero',
  is_default_space: false,
  managed_caller: true,
};

/** The proposal id fields the loaded `storedDocument()` resolves to: a chain root, so both match. */
const STORED_ID_FIELDS = { proposal_id: 'proposal-1', root_proposal_id: 'proposal-1' };

/** The managed definition id a managed action workflow was installed from. */
const MANAGED_ACTION_ID = 'security-isolate-host';

const storedDocument = (overrides: Partial<ProposalDocument> = {}): ProposalDocument => ({
  spaceId: SPACE_ID,
  conversationId: 'conv-1',
  comment: 'Isolate the host',
  actionWorkflowId: 'action-workflow-1',
  actionInput: { hostId: 'host-1' },
  actionId: 'custom',
  status: 'pending',
  impact: 'high',
  confidence: 'medium',
  category: 'respond',
  origin: 'worker',
  impactRank: 1,
  confidenceRank: 1,
  workflowExecutionId: EXECUTION_ID,
  createdAt: CREATED_AT,
  expiresAt: '2099-01-01T00:00:00.000Z',
  rootProposalId: 'proposal-1',
  revision: 1,
  attempt: 1,
  autoApproveRequested: false,
  callerManagedBy: 'alertzero',
  callerRunId: 'exec-root',
  callerWorkflowExecutionId: 'exec-caller',
  callerWorkflowId: 'wf-caller',
  ...overrides,
});

const createStorage = (document?: ProposalDocument) => ({
  index: jest.fn().mockResolvedValue({ _id: 'proposal-1' }),
  delete: jest.fn().mockResolvedValue({ acknowledged: true, result: 'deleted' }),
  search: jest.fn().mockResolvedValue({
    hits: {
      hits: document
        ? [{ _id: 'proposal-1', _source: document, _seq_no: 7, _primary_term: 1 }]
        : [],
    },
  }),
  esql: jest.fn(),
});

const createWorkflowsApi = () => ({
  getWorkflow: jest.fn().mockResolvedValue({
    definition: { consts: { actionMetadata: { name: 'Isolate host', category: 'respond' } } },
  }),
  getWorkflowExecution: jest.fn().mockResolvedValue({
    id: EXECUTION_ID,
    status: ExecutionStatus.WAITING_FOR_INPUT,
    finishedAt: undefined,
    stepExecutions: [
      {
        id: 'step-exec-1',
        stepType: 'waitForApproval',
        status: ExecutionStatus.WAITING_FOR_INPUT,
        startedAt: '2026-09-01T00:01:00.000Z',
      },
    ],
  }),
  resumeWorkflowExecution: jest.fn().mockResolvedValue({ resumedBy: 'analyst' }),
});

const createService = ({
  analytics = { reportEvent: jest.fn() },
  document,
  telemetry = true,
  workflowsApi = createWorkflowsApi(),
}: {
  analytics?: ProposalsTelemetryAnalytics;
  document?: ProposalDocument;
  telemetry?: boolean;
  workflowsApi?: ReturnType<typeof createWorkflowsApi>;
} = {}) => {
  const logger = loggerMock.create();
  const storage = createStorage(document);
  const service = new ProposalsService({
    storage: storage as unknown as ProposalsStorageClient,
    logger,
    getWorkflowsApi: () => workflowsApi as never,
    getAttachmentsClient: async () => ({ create: jest.fn() } as never),
    ...(telemetry ? { telemetry: createProposalsTelemetryReporter({ analytics, logger }) } : {}),
  });
  return { analytics, logger, service, storage, workflowsApi };
};

/** Every reported `[eventType, payload]` pair, in order. */
const reported = (analytics: ProposalsTelemetryAnalytics) =>
  (analytics.reportEvent as jest.Mock).mock.calls;

const reportedTypes = (analytics: ProposalsTelemetryAnalytics) =>
  reported(analytics).map(([eventType]) => eventType);

const throwingAnalytics = (): ProposalsTelemetryAnalytics => ({
  reportEvent: jest.fn(() => {
    throw new Error('analytics is down');
  }),
});

const createParams: CreateProposalRequest = {
  conversationId: 'conv-1',
  comment: 'Isolate the host',
  actionWorkflowId: 'action-workflow-1',
  actionInput: { hostId: 'host-1' },
  impact: 'high',
  confidence: 'medium',
  origin: 'worker',
  expiresAt: '2099-01-01T00:00:00.000Z',
  workflowExecutionId: EXECUTION_ID,
};

const CALLER_PROVENANCE = {
  autoApproveRequested: true,
  callerManagedBy: 'alertzero',
  callerRunId: 'exec-root',
  callerWorkflowExecutionId: 'exec-caller',
  callerWorkflowId: 'wf-caller',
};

describe('ProposalsService telemetry', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-01T02:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create', () => {
    it('reports proposals_proposal_created after the write', async () => {
      const { analytics, service, storage } = createService();

      const proposal = await service.create(createParams, {
        provenance: CALLER_PROVENANCE,
        request,
        spaceId: SPACE_ID,
      });

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalCreated,
          {
            ...CALLER_FIELDS,
            // A new proposal is the root of its own chain.
            proposal_id: proposal.id,
            root_proposal_id: proposal.id,
            action_id: 'custom',
            auto_approve_requested: true,
            category: 'respond',
            confidence_bucket: 'medium',
            expires_in_bucket: 'gt_7d',
            has_action: true,
            impact_class: 'high',
          },
        ],
      ]);
      expect((analytics.reportEvent as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan(
        storage.index.mock.invocationCallOrder[0]
      );
    });

    it('reports a custom caller in the default space', async () => {
      const { analytics, service } = createService();

      await service.create(createParams, { request, spaceId: 'default' });

      expect(reported(analytics)[0][1]).toEqual(
        expect.objectContaining({
          auto_approve_requested: false,
          consumer: 'custom',
          is_default_space: true,
          managed_caller: false,
        })
      );
      expect(reported(analytics)[0][1]).not.toHaveProperty('caller_run_id');
    });

    it("reports a managed action workflow's origin definition id as the action id", async () => {
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockResolvedValue({
        definition: {},
        managed: true,
        originManagedWorkflowId: MANAGED_ACTION_ID,
      });
      const { analytics, service } = createService({ workflowsApi });

      await service.create(createParams, { request, spaceId: SPACE_ID });

      expect(reported(analytics)[0][1]).toEqual(
        expect.objectContaining({ action_id: MANAGED_ACTION_ID, has_action: true })
      );
    });

    it('reports custom, never the raw id, for an action workflow no plugin manages', async () => {
      const { analytics, service } = createService();

      await service.create(
        { ...createParams, actionWorkflowId: 'secret-customer-workflow' },
        { request, spaceId: SPACE_ID }
      );

      expect(reported(analytics)[0][1]).toEqual(expect.objectContaining({ action_id: 'custom' }));
      expect(JSON.stringify(reported(analytics))).not.toContain('secret-customer-workflow');
    });

    it('reports no action id for a proposal without an action', async () => {
      const { analytics, service } = createService();

      await service.create(
        { ...createParams, actionWorkflowId: undefined, actionInput: undefined },
        { request, spaceId: SPACE_ID }
      );

      expect(reported(analytics)[0][1]).toEqual(expect.objectContaining({ has_action: false }));
      expect(reported(analytics)[0][1]).not.toHaveProperty('action_id');
    });

    it('reports no action id when the action workflow cannot be read', async () => {
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflow.mockRejectedValue(new Error('workflows API unavailable'));
      const { analytics, service } = createService({ workflowsApi });

      await service.create(createParams, { request, spaceId: SPACE_ID });

      expect(reported(analytics)[0][1]).not.toHaveProperty('action_id');
    });

    it('reports nothing when the write fails', async () => {
      const { analytics, service, storage } = createService();
      storage.index.mockRejectedValue(new Error('index unavailable'));

      await expect(service.create(createParams, { request, spaceId: SPACE_ID })).rejects.toThrow(
        'index unavailable'
      );

      expect(reported(analytics)).toEqual([]);
    });

    it('still creates the proposal when analytics throws', async () => {
      const { service, storage } = createService({ analytics: throwingAnalytics() });

      const proposal = await service.create(createParams, { request, spaceId: SPACE_ID });

      expect(proposal.status).toBe('pending');
      expect(storage.index).toHaveBeenCalledTimes(1);
    });

    it('creates the proposal without a telemetry reporter', async () => {
      const { service } = createService({ telemetry: false });

      await expect(
        service.create(createParams, { request, spaceId: SPACE_ID })
      ).resolves.toMatchObject({ status: 'pending' });
    });
  });

  describe('update', () => {
    it('reports the decision and the transition of a human approval', async () => {
      const { analytics, service } = createService({ document: storedDocument() });

      await service.update(
        { id: 'proposal-1', decision: 'approved', decisionSource: 'human', status: 'executing' },
        SPACE_ID
      );

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalDecided,
          {
            ...CALLER_FIELDS,
            ...STORED_ID_FIELDS,
            attempt: 1,
            decided_after_deadline: false,
            decision: 'approved',
            decision_source: 'human',
            time_to_decision_ms: 2 * 60 * 60 * 1000,
          },
        ],
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
          { ...CALLER_FIELDS, ...STORED_ID_FIELDS, from_status: 'pending', to_status: 'executing' },
        ],
      ]);
    });

    it('reports an autonomy approval without a time to decision', async () => {
      const { analytics, service } = createService({ document: storedDocument() });

      await service.update(
        { id: 'proposal-1', decision: 'approved', decisionSource: 'autonomy', status: 'no_action' },
        SPACE_ID
      );

      const [[, decided]] = reported(analytics);
      expect(decided).toEqual(expect.objectContaining({ decision_source: 'autonomy' }));
      expect(decided).not.toHaveProperty('time_to_decision_ms');
    });

    it('flags a decision recorded after the deadline', async () => {
      const { analytics, service } = createService({
        document: storedDocument({ expiresAt: '2026-09-01T01:00:00.000Z' }),
      });

      await service.update(
        { id: 'proposal-1', decision: 'approved', decisionSource: 'human', status: 'no_action' },
        SPACE_ID
      );

      expect(reported(analytics)[0][1]).toEqual(
        expect.objectContaining({ decided_after_deadline: true, time_to_decision_ms: 7_200_000 })
      );
    });

    it('measures the time to decision from the chain root of a retry', async () => {
      const { analytics, service } = createService({
        document: storedDocument({ attempt: 2, createdAt: '2026-08-31T00:00:00.000Z' }),
      });

      await service.update(
        { id: 'proposal-1', decision: 'approved', decisionSource: 'human', status: 'executing' },
        SPACE_ID
      );

      expect(reported(analytics)[0][1]).toEqual(
        expect.objectContaining({ attempt: 2, time_to_decision_ms: 26 * 60 * 60 * 1000 })
      );
    });

    it('reports the dismiss reason annotated before the dismissal', async () => {
      const { analytics, service } = createService({
        document: storedDocument({ dismissReason: 'duplicate' }),
      });

      await service.update(
        { id: 'proposal-1', decision: 'dismissed', decisionSource: 'human', status: 'no_action' },
        SPACE_ID
      );

      expect(reportedTypes(analytics)).toEqual([
        PROPOSALS_TELEMETRY_EVENTS.ProposalDecided,
        PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
      ]);
      expect(reported(analytics)[0][1]).toEqual(
        expect.objectContaining({ decision: 'dismissed', dismiss_reason: 'duplicate' })
      );
    });

    it("reports the transition and the outcome of the action's success", async () => {
      const { analytics, service } = createService({
        document: storedDocument({
          decidedAt: '2026-09-01T01:59:00.000Z',
          decision: 'approved',
          decisionSource: 'human',
          status: 'executing',
        }),
      });

      await service.update({ id: 'proposal-1', status: 'succeeded' }, SPACE_ID);

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
          {
            ...CALLER_FIELDS,
            ...STORED_ID_FIELDS,
            from_status: 'executing',
            to_status: 'succeeded',
          },
        ],
        [
          PROPOSALS_TELEMETRY_EVENTS.ActionExecuted,
          {
            ...CALLER_FIELDS,
            ...STORED_ID_FIELDS,
            action_id: 'custom',
            attempt: 1,
            category: 'respond',
            execution_duration_ms: 60_000,
            outcome: 'succeeded',
          },
        ],
      ]);
    });

    it('reports the action id stored at creation without reading the action again', async () => {
      const { analytics, service, workflowsApi } = createService({
        document: storedDocument({
          actionId: MANAGED_ACTION_ID,
          decidedAt: '2026-09-01T01:59:00.000Z',
          decision: 'approved',
          status: 'executing',
        }),
      });

      await service.update({ id: 'proposal-1', status: 'succeeded' }, SPACE_ID);

      expect(reported(analytics)[1]).toEqual([
        PROPOSALS_TELEMETRY_EVENTS.ActionExecuted,
        expect.objectContaining({ ...STORED_ID_FIELDS, action_id: MANAGED_ACTION_ID }),
      ]);
      expect(workflowsApi.getWorkflow).not.toHaveBeenCalled();
    });

    it('carries the chain root of a later chain member on every update event', async () => {
      const { analytics, service } = createService({
        document: storedDocument({ attempt: 2, rootProposalId: 'proposal-root' }),
      });

      await service.update(
        { id: 'proposal-1', decision: 'approved', decisionSource: 'human', status: 'executing' },
        SPACE_ID
      );

      expect(reported(analytics).map(([, payload]) => payload)).toEqual(
        Array(2).fill(
          expect.objectContaining({ proposal_id: 'proposal-1', root_proposal_id: 'proposal-root' })
        )
      );
    });

    it("attributes the action's own failure to the action", async () => {
      const { analytics, service } = createService({
        document: storedDocument({
          decidedAt: '2026-09-01T01:59:00.000Z',
          decision: 'approved',
          status: 'executing',
        }),
      });

      await service.update(
        { id: 'proposal-1', status: 'failed', executionError: 'action failed' },
        SPACE_ID
      );

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
          {
            ...CALLER_FIELDS,
            ...STORED_ID_FIELDS,
            failure_source: 'action',
            from_status: 'executing',
            to_status: 'failed',
          },
        ],
        [PROPOSALS_TELEMETRY_EVENTS.ActionExecuted, expect.objectContaining({ outcome: 'failed' })],
      ]);
    });

    it('attributes a gate failure settled onto a running action to the workflow', async () => {
      const { analytics, service } = createService({
        document: storedDocument({
          decidedAt: '2026-09-01T01:59:00.000Z',
          decision: 'approved',
          status: 'executing',
        }),
      });

      await service.update(
        { id: 'proposal-1', status: 'failed', settledBy: 'workflow_failure' },
        SPACE_ID
      );

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
          {
            ...CALLER_FIELDS,
            ...STORED_ID_FIELDS,
            failure_source: 'workflow_failure',
            from_status: 'executing',
            to_status: 'failed',
          },
        ],
      ]);
    });

    it.each(['deadline', 'iteration_limit', 'workflow_failure'] as const)(
      'reports an expiry settled by %s with its reason',
      async (settledBy) => {
        const { analytics, service } = createService({ document: storedDocument() });

        await service.update({ id: 'proposal-1', status: 'expired', settledBy }, SPACE_ID);

        expect(reported(analytics)).toEqual([
          [
            PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
            {
              ...CALLER_FIELDS,
              ...STORED_ID_FIELDS,
              expiry_reason: settledBy,
              from_status: 'pending',
              to_status: 'expired',
            },
          ],
        ]);
      }
    );

    it('reports nothing for an idempotent rewrite of a settled status', async () => {
      const { analytics, service, storage } = createService({
        document: storedDocument({
          decidedAt: '2026-09-01T01:59:00.000Z',
          decision: 'approved',
          status: 'failed',
        }),
      });

      await service.update(
        { id: 'proposal-1', status: 'failed', settledBy: 'workflow_failure' },
        SPACE_ID
      );

      expect(storage.index).toHaveBeenCalledTimes(1);
      expect(reported(analytics)).toEqual([]);
    });

    it('reports nothing for an annotation-only write', async () => {
      const { analytics, service } = createService({ document: storedDocument() });

      await service.update({ id: 'proposal-1', rationale: 'noted' }, SPACE_ID);

      expect(reported(analytics)).toEqual([]);
    });

    it('reports nothing when the write loses its race', async () => {
      const { analytics, service, storage } = createService({ document: storedDocument() });
      storage.index.mockRejectedValue({ statusCode: 409 });

      await expect(
        service.update({ id: 'proposal-1', status: 'expired', settledBy: 'deadline' }, SPACE_ID)
      ).rejects.toBeInstanceOf(ProposalConflictError);

      expect(reported(analytics)).toEqual([]);
    });

    it('reports nothing for a refused write', async () => {
      const { analytics, service } = createService({
        document: storedDocument({ decision: 'dismissed', status: 'no_action' }),
      });

      await expect(
        service.update({ id: 'proposal-1', decision: 'approved' }, SPACE_ID)
      ).rejects.toBeInstanceOf(ProposalConflictError);

      expect(reported(analytics)).toEqual([]);
    });

    it('still records the decision when analytics throws', async () => {
      const { service, storage } = createService({
        analytics: throwingAnalytics(),
        document: storedDocument(),
      });

      const proposal = await service.update(
        { id: 'proposal-1', decision: 'approved', decisionSource: 'human', status: 'executing' },
        SPACE_ID
      );

      expect(proposal).toEqual(expect.objectContaining({ decision: 'approved' }));
      expect(storage.index).toHaveBeenCalledTimes(1);
    });
  });

  describe('clone', () => {
    const failed = () =>
      storedDocument({
        attempt: 1,
        decidedAt: '2026-09-01T01:00:00.000Z',
        decision: 'approved',
        status: 'failed',
      });

    it('reports proposals_proposal_retried after both writes', async () => {
      const { analytics, service, storage } = createService({ document: failed() });

      const cloneId = await service.clone(
        { id: 'proposal-1', executionError: 'action failed' },
        SPACE_ID
      );

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
          // The clone's own id, and the root of the chain it continues.
          { ...CALLER_FIELDS, proposal_id: cloneId, root_proposal_id: 'proposal-1', attempt: 2 },
        ],
      ]);
      expect(storage.index).toHaveBeenCalledTimes(2);
      expect((analytics.reportEvent as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan(
        storage.index.mock.invocationCallOrder[1]
      );
    });

    it('carries the new id and the unchanged chain root for a retry of a retry', async () => {
      const { analytics, service } = createService({
        document: { ...failed(), attempt: 2, rootProposalId: 'proposal-root' },
      });

      const cloneId = await service.clone({ id: 'proposal-1' }, SPACE_ID);

      expect(cloneId).not.toBe('proposal-1');
      expect(reported(analytics)[0][1]).toEqual(
        expect.objectContaining({
          attempt: 3,
          proposal_id: cloneId,
          root_proposal_id: 'proposal-root',
        })
      );
    });

    it('reports nothing when the second write fails', async () => {
      const { analytics, service, storage } = createService({ document: failed() });
      storage.index.mockResolvedValueOnce({ _id: 'clone' }).mockRejectedValueOnce({
        statusCode: 409,
      });

      await expect(service.clone({ id: 'proposal-1' }, SPACE_ID)).rejects.toBeInstanceOf(
        ProposalConflictError
      );

      expect(reported(analytics)).toEqual([]);
    });

    it('still clones when analytics throws', async () => {
      const { service } = createService({ analytics: throwingAnalytics(), document: failed() });

      await expect(service.clone({ id: 'proposal-1' }, SPACE_ID)).resolves.toEqual(
        expect.any(String)
      );
    });
  });

  describe('revise', () => {
    it('reports proposals_proposal_revised after both writes, and no status change', async () => {
      const { analytics, service, storage } = createService({ document: storedDocument() });

      const { proposalId } = await service.revise(
        { id: 'proposal-1', comment: 'Isolate both hosts', impact: 'critical' },
        SPACE_ID,
        request
      );

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalRevised,
          {
            ...CALLER_FIELDS,
            // The new revision's own id, and the root of the chain it extends.
            proposal_id: proposalId,
            root_proposal_id: 'proposal-1',
            action_input_changed: false,
            comment_changed: true,
            confidence_changed: false,
            impact_changed: true,
            revision: 2,
          },
        ],
      ]);
      expect((analytics.reportEvent as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan(
        storage.index.mock.invocationCallOrder[1]
      );
    });

    it('carries the new id and the unchanged chain root for a revision of a revision', async () => {
      const { analytics, service } = createService({
        document: storedDocument({ revision: 2, rootProposalId: 'proposal-root' }),
      });

      const { proposalId } = await service.revise(
        { id: 'proposal-1', comment: 'Isolate all three hosts' },
        SPACE_ID,
        request
      );

      expect(proposalId).not.toBe('proposal-1');
      expect(reported(analytics)[0][1]).toEqual(
        expect.objectContaining({
          proposal_id: proposalId,
          revision: 3,
          root_proposal_id: 'proposal-root',
        })
      );
    });

    it('reports a changed action input without its values', async () => {
      const { analytics, service } = createService({ document: storedDocument() });

      await service.revise(
        { id: 'proposal-1', actionInput: { hostId: 'secret-host' } },
        SPACE_ID,
        request
      );

      expect(reported(analytics)[0][1]).toEqual(
        expect.objectContaining({ action_input_changed: true, comment_changed: false })
      );
      expect(JSON.stringify(reported(analytics))).not.toContain('secret-host');
    });

    it('reports nothing when the revision loses its race and is retired', async () => {
      const { analytics, service, storage } = createService({ document: storedDocument() });
      storage.index.mockResolvedValueOnce({ _id: 'revision' }).mockRejectedValueOnce({
        statusCode: 409,
      });

      await expect(
        service.revise({ id: 'proposal-1', comment: 'late' }, SPACE_ID, request)
      ).rejects.toBeInstanceOf(ProposalConflictError);

      expect(storage.delete).toHaveBeenCalledTimes(1);
      expect(reported(analytics)).toEqual([]);
    });

    it('still revises when analytics throws', async () => {
      const { service } = createService({
        analytics: throwingAnalytics(),
        document: storedDocument(),
      });

      await expect(
        service.revise({ id: 'proposal-1', comment: 'revised' }, SPACE_ID, request)
      ).resolves.toEqual(expect.objectContaining({ revision: 2 }));
    });
  });

  describe('releaseGate', () => {
    const release = (service: ProposalsService, overrides = {}) =>
      service.releaseGate('proposal-1', {
        approved: true,
        request,
        spaceId: SPACE_ID,
        ...overrides,
      });

    it('reports nothing for a release that resumes the gate', async () => {
      const { analytics, service } = createService({ document: storedDocument() });

      await release(service);

      expect(reported(analytics)).toEqual([]);
    });

    it.each([
      ['already_decided', { decision: 'approved' as const, status: 'executing' as const }],
      ['settled', { status: 'expired' as const }],
      ['expired', { expiresAt: '2026-09-01T01:00:00.000Z' }],
    ])('reports a %s refusal', async (reason, overrides) => {
      const { analytics, service } = createService({ document: storedDocument(overrides) });

      await expect(release(service)).rejects.toThrow();

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected,
          { ...CALLER_FIELDS, ...STORED_ID_FIELDS, reason },
        ],
      ]);
    });

    it('reports an input_changed refusal', async () => {
      const { analytics, service } = createService({ document: storedDocument() });

      await expect(release(service, { actionInput: { hostId: 'host-2' } })).rejects.toThrow();

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected,
          { ...CALLER_FIELDS, ...STORED_ID_FIELDS, reason: 'input_changed' },
        ],
      ]);
    });

    it.each([
      ['a proposal with no gate execution', { workflowExecutionId: undefined }, undefined],
      ['a gate execution that no longer exists', {}, null],
    ])('reports no_execution for %s', async (_label, overrides, execution) => {
      const workflowsApi = createWorkflowsApi();
      if (execution !== undefined) {
        workflowsApi.getWorkflowExecution.mockResolvedValue(execution);
      }
      const { analytics, service } = createService({
        document: storedDocument(overrides),
        workflowsApi,
      });

      await expect(release(service)).rejects.toBeInstanceOf(ProposalConflictError);

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected,
          { ...CALLER_FIELDS, ...STORED_ID_FIELDS, reason: 'no_execution' },
        ],
      ]);
    });

    it('reports not_waiting for a gate that is no longer parked', async () => {
      const workflowsApi = createWorkflowsApi();
      workflowsApi.getWorkflowExecution.mockResolvedValue({
        id: EXECUTION_ID,
        status: ExecutionStatus.COMPLETED,
        finishedAt: '2026-09-01T01:00:00.000Z',
        stepExecutions: [],
      });
      const { analytics, service } = createService({ document: storedDocument(), workflowsApi });

      await expect(release(service)).rejects.toBeInstanceOf(ProposalConflictError);

      expect(reported(analytics)).toEqual([
        [
          PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected,
          { ...CALLER_FIELDS, ...STORED_ID_FIELDS, reason: 'not_waiting' },
        ],
      ]);
    });

    it('reports nothing for a missing proposal', async () => {
      const { analytics, service } = createService();

      await expect(release(service)).rejects.toThrow();

      expect(reported(analytics)).toEqual([]);
    });

    it('reports nothing when the annotation loses its race', async () => {
      const { analytics, service, storage } = createService({ document: storedDocument() });
      storage.index.mockRejectedValue({ statusCode: 409 });

      await expect(release(service, { rationale: 'looks right' })).rejects.toBeInstanceOf(
        ProposalConflictError
      );

      expect(reported(analytics)).toEqual([]);
    });

    it('reports nothing when the resume API itself fails', async () => {
      const workflowsApi = createWorkflowsApi();
      workflowsApi.resumeWorkflowExecution.mockRejectedValue(new Error('resume unavailable'));
      const { analytics, service } = createService({ document: storedDocument(), workflowsApi });

      await expect(release(service)).rejects.toThrow('resume unavailable');

      expect(reported(analytics)).toEqual([]);
    });

    it('still surfaces the refusal when analytics throws', async () => {
      const { service } = createService({
        analytics: throwingAnalytics(),
        document: storedDocument({ status: 'expired' }),
      });

      await expect(release(service)).rejects.toBeInstanceOf(ProposalConflictError);
    });
  });

  describe('reportResumeRejected', () => {
    it.each(['unprivileged', 'external_principal'] as const)(
      'reports a %s refusal for the stored proposal',
      async (reason) => {
        const { analytics, service } = createService({ document: storedDocument() });

        await service.reportResumeRejected({ id: 'proposal-1', reason, spaceId: SPACE_ID });

        expect(reported(analytics)).toEqual([
          [
            PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected,
            { ...CALLER_FIELDS, ...STORED_ID_FIELDS, reason },
          ],
        ]);
      }
    );

    it('resolves without reporting when the proposal cannot be read', async () => {
      const { analytics, service } = createService();

      await expect(
        service.reportResumeRejected({
          id: 'proposal-1',
          reason: 'unprivileged',
          spaceId: SPACE_ID,
        })
      ).resolves.toBeUndefined();

      expect(reported(analytics)).toEqual([]);
    });

    it('resolves when the read throws', async () => {
      const { analytics, service, storage } = createService();
      storage.search.mockRejectedValue(new Error('search unavailable'));

      await expect(
        service.reportResumeRejected({
          id: 'proposal-1',
          reason: 'unprivileged',
          spaceId: SPACE_ID,
        })
      ).resolves.toBeUndefined();

      expect(reported(analytics)).toEqual([]);
    });

    it('does not read the proposal without a telemetry reporter', async () => {
      const { service, storage } = createService({
        document: storedDocument(),
        telemetry: false,
      });

      await service.reportResumeRejected({
        id: 'proposal-1',
        reason: 'unprivileged',
        spaceId: SPACE_ID,
      });

      expect(storage.search).not.toHaveBeenCalled();
    });
  });

  describe('dev-mode schema conformance', () => {
    /** A real analytics client in dev mode, which throws on any payload its schema rejects. */
    const createDevAnalytics = () => {
      const client = createAnalytics({ isDev: true, logger: loggerMock.create() });
      registerProposalsTelemetryEvents(client);
      const reportEvent = jest.spyOn(client, 'reportEvent');
      // The spy replaces `reportEvent` on the client itself, so every report through the
      // client is recorded, including the ones its validation throws on.
      return { analytics: client, reportEvent };
    };

    it('reports payloads the registered schemas accept on every write path', async () => {
      const { analytics, reportEvent } = createDevAnalytics();

      await createService({ analytics }).service.create(createParams, {
        provenance: CALLER_PROVENANCE,
        request,
        spaceId: SPACE_ID,
      });
      await createService({
        analytics,
        document: storedDocument({ dismissReason: 'duplicate' }),
      }).service.update(
        { id: 'proposal-1', decision: 'dismissed', decisionSource: 'human', status: 'no_action' },
        SPACE_ID
      );
      await createService({
        analytics,
        document: storedDocument({
          decidedAt: '2026-09-01T01:59:00.000Z',
          decision: 'approved',
          status: 'executing',
        }),
      }).service.update({ id: 'proposal-1', status: 'failed' }, SPACE_ID);
      await createService({ analytics, document: storedDocument() }).service.update(
        { id: 'proposal-1', status: 'expired', settledBy: 'deadline' },
        SPACE_ID
      );
      await createService({
        analytics,
        document: storedDocument({ decision: 'approved', status: 'failed' }),
      }).service.clone({ id: 'proposal-1' }, SPACE_ID);
      await createService({ analytics, document: storedDocument() }).service.revise(
        { id: 'proposal-1', confidence: 'high' },
        SPACE_ID,
        request
      );
      await createService({ analytics, document: storedDocument() }).service.reportResumeRejected({
        id: 'proposal-1',
        reason: 'external_principal',
        spaceId: SPACE_ID,
      });

      expect(new Set(reportEvent.mock.calls.map(([eventType]) => eventType))).toEqual(
        new Set([
          PROPOSALS_TELEMETRY_EVENTS.ProposalCreated,
          PROPOSALS_TELEMETRY_EVENTS.ProposalDecided,
          PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
          PROPOSALS_TELEMETRY_EVENTS.ActionExecuted,
          PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
          PROPOSALS_TELEMETRY_EVENTS.ProposalRevised,
          PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected,
        ])
      );
      expect(reportEvent.mock.results.filter(({ type }) => type !== 'return')).toEqual([]);
    });
  });
});
