/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExecutionStatus } from '@kbn/workflows';
import type { ProposalGateFixture } from './proposal_gate_fixture';
import { createProposalGateFixture } from './proposal_gate_fixture';

const ACTION_WORKFLOW_ID = 'system-alertzero-action-create-rule';

/**
 * Drives the shipped gate workflow through the real execution engine, with
 * Elasticsearch replaced by a Map.
 *
 * The YAML-shape unit tests assert how the loop is wired; these assert what it
 * does. That distinction matters because the loop's correctness rests on engine
 * semantics a shape test cannot see — that a parked gate re-parks on a fresh
 * step execution, that `data.set` variables survive a resume, and that every
 * decision/status pair the workflow writes is one the service will accept.
 */
/**
 * Hours between `from` and the proposal's recorded deadline. Approximate by
 * construction: the service stamps `expiresAt` from its own clock a few
 * milliseconds after the caller reads one, so assertions compare to a
 * precision, not to an exact boundary.
 */
const hoursUntilDeadline = (fixture: ProposalGateFixture, from: number): number =>
  (Date.parse(fixture.onlyProposal().expiresAt!) - from) / 3_600_000;

describe('create-investigation-proposal workflow execution', () => {
  let fixture: ProposalGateFixture;

  beforeEach(() => {
    fixture = createProposalGateFixture();
  });

  describe('parking on the gate', () => {
    it('should create an undecided proposal and wait for a human', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
      const proposal = fixture.onlyProposal();
      expect(proposal.status).toBe('pending');
      expect(proposal.decision).toBeUndefined();
    });

    it('should record the deadline it will hold every attempt to', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      expect(fixture.onlyProposal().expiresAt).toEqual(expect.any(String));
    });

    it('should default that deadline to 72h when the caller does not ask for one', async () => {
      const before = Date.now();
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      expect(hoursUntilDeadline(fixture, before)).toBeCloseTo(72, 1);
    });

    it('should honour a deadline the caller does ask for', async () => {
      // The gate parks against whatever this resolves to, so a worker that
      // knows its decision is urgent can shorten the window without the queue
      // and the gate disagreeing about when it expires.
      const before = Date.now();
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, expiresIn: '4h' });

      expect(hoursUntilDeadline(fixture, before)).toBeCloseTo(4, 1);
    });

    it('should park the gate for that deadline, not for the default', async () => {
      // The recorded `expiresAt` and the duration the gate is actually held
      // for are two different values, and only the second one decides when an
      // unanswered proposal expires. This reads the rendered `dynamicTimeout`
      // the engine froze at wait-entry, which is what the idle wake-up and the
      // resume check both consult.
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, expiresIn: '4h' });

      const parkedSeconds = Number(String(fixture.gateTimeout()).replace(/s$/, ''));
      expect(parkedSeconds).toBeGreaterThan(3.9 * 3600);
      expect(parkedSeconds).toBeLessThanOrEqual(4 * 3600);
    });

    it('should expire at that deadline rather than holding for 72h', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, expiresIn: '4h' });
      await fixture.timeOutGate(5 * 60 * 60 * 1000);

      expect(fixture.onlyProposal().status).toBe('expired');
    });

    it('should record the execution so approving resumes the run that created it', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      expect(fixture.onlyProposal().workflowExecutionId).toBe('fake_workflow_execution_id');
    });

    it('should fill the grouping and ranking fields a caller left out', async () => {
      // The caller passes only what it knows, and the YAML renders every other
      // input as `''` — Liquid has no way to omit a key. Left as empty strings
      // these reach the queue, which groups by category and silently drops
      // whatever it cannot group, so the proposal never appears at all.
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      const proposal = fixture.onlyProposal();
      // Resolved from the action workflow's own declared metadata, which an
      // empty-string category would have taken precedence over.
      expect(proposal.category).toBe('tune');
      expect(proposal.impact).toBe('low');
      expect(proposal.confidence).toBe('medium');
    });
  });

  describe('dismissal', () => {
    it('should settle as dismissed with no action and complete', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(false);

      const proposal = fixture.onlyProposal();
      expect(proposal.decision).toBe('dismissed');
      expect(proposal.status).toBe('no_action');
      expect(proposal.decidedAt).toEqual(expect.any(String));
      expect(fixture.executionStatus()).toBe(ExecutionStatus.COMPLETED);
    });

    it('should attribute the dismissal to whoever answered the gate', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(false, 'dismissing-analyst');

      expect(fixture.onlyProposal().decidedBy?.username).toBe('dismissing-analyst');
    });
  });

  describe('approving a proposal with no action', () => {
    it('should settle as approved with no action rather than staying awaiting', async () => {
      // Approval is the whole lifecycle when there is nothing to run, so
      // without `no_action` this would sit at `pending` forever.
      await fixture.start();

      await fixture.resume(true);

      const proposal = fixture.onlyProposal();
      expect(proposal.decision).toBe('approved');
      expect(proposal.status).toBe('no_action');
      expect(fixture.executionStatus()).toBe(ExecutionStatus.COMPLETED);
    });
  });

  describe('an unprivileged resumer', () => {
    it('should write nothing and park again for someone who can decide', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      fixture.setCanDecide(false);

      await fixture.resume(true);

      // The gate is spent, but the record is untouched — which is the whole
      // reason the privilege check precedes every write.
      const proposal = fixture.onlyProposal();
      expect(proposal.decision).toBeUndefined();
      expect(proposal.status).toBe('pending');
      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should park on a new gate step execution, so a second answer can be claimed', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      fixture.setCanDecide(false);

      await fixture.resume(true);

      const gates = fixture.stepExecutions('await_decision', 'waitForApproval');
      expect(gates).toHaveLength(2);
      expect(gates[0].status).toBe(ExecutionStatus.COMPLETED);
      expect(gates[1].status).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should let a privileged approver decide the re-parked proposal', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      fixture.setCanDecide(false);
      await fixture.resume(true);

      fixture.setCanDecide(true);
      await fixture.resume(false, 'privileged-analyst');

      const proposal = fixture.onlyProposal();
      expect(proposal.decision).toBe('dismissed');
      expect(proposal.decidedBy?.username).toBe('privileged-analyst');
      expect(fixture.executionStatus()).toBe(ExecutionStatus.COMPLETED);
    });

    it('should carry the proposal id across the park, proving variables survive a resume', async () => {
      // `data.set` is the only eviction-exempt step type, which is why the loop
      // keeps everything it carries in variables rather than step outputs.
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      const createdId = fixture.onlyProposal().id;
      fixture.setCanDecide(false);
      await fixture.resume(true);

      fixture.setCanDecide(true);
      await fixture.resume(false);

      expect(fixture.onlyProposal().id).toBe(createdId);
      expect(fixture.onlyProposal().decision).toBe('dismissed');
    });
  });

  describe('a proposal revised while its gate is parked', () => {
    it("runs the action against the revised actionInput, not the trigger's original", async () => {
      await fixture.start({
        actionWorkflowId: ACTION_WORKFLOW_ID,
        actionInput: { name: 'original-name' },
      });

      await fixture.revise({ actionInput: { name: 'analyst-corrected-name' } });
      await fixture.resume(true);

      const executions = fixture.stepExecutions('execute_action', 'workflow.execute');
      expect(executions).toHaveLength(1);
      // The trigger's static `inputs.actionInput` still reads `original-name`;
      // asserting on the executed step's own recorded input, not on the
      // proposal record, is what actually proves the revision reached the
      // action rather than the workflow's original static trigger input.
      const input = executions[0].input as { inputs?: { actionInput?: Record<string, unknown> } };
      expect(input?.inputs?.actionInput).toEqual({ name: 'analyst-corrected-name' });
    });

    it('marks the pre-revision proposal superseded and settles the outcome on the revision', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      const original = fixture.onlyProposal();

      await fixture.revise({ comment: 'clarified per analyst request' });
      await fixture.resume(true);

      const [supersededOriginal, revision] = fixture.proposals();
      expect(supersededOriginal.id).toBe(original.id);
      expect(supersededOriginal.status).toBe('superseded');
      expect(supersededOriginal.supersededBy).toBe(revision.id);
      expect(revision.decision).toBe('approved');
    });

    // The loop no longer re-checks the clock after the gate. The engine's own
    // timeout task settles anything the deadline caught, and the release route
    // refuses an expired decision, so the only thing that reached the old
    // post-gate check was a resume landing in the seconds before Task Manager
    // claimed the timeout task. That decision is now honoured, and — the part
    // worth pinning — it is honoured against the revision, not the row it
    // replaced.
    it('honours a decision resumed after the deadline, against the live revision', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      const original = fixture.onlyProposal();

      await fixture.revise({ comment: 'clarified per analyst request' });
      await fixture.resumeAfterDeadline(true);

      const [predecessor, revision] = fixture.proposals();
      expect(predecessor.id).toBe(original.id);
      // Untouched: the decision has to land on the head, not resurrect the row
      // it replaced.
      expect(predecessor.status).toBe('superseded');
      expect(revision.decision).toBe('approved');
    });
  });

  describe('an external resume', () => {
    // Carries no request, so the engine wakes the pre-scheduled task under the
    // workflow runner's own API key. That identity always holds
    // `manage_proposals` — it had to, to create the proposal — so checking it
    // would authorize every click on a magic link as the Worker, and record the
    // Worker as the decider.
    const EXTERNAL_PRINCIPAL = 'external_resume:step-exec-1';

    it('should be refused and re-parked rather than decided as the Worker', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true, EXTERNAL_PRINCIPAL);

      const proposal = fixture.onlyProposal();
      expect(proposal.decision).toBeUndefined();
      expect(proposal.status).toBe('pending');
      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should be refused even though the execution identity is privileged', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      // Privileges are wide open, so only the responder check can refuse this.
      fixture.setCanDecide(true);

      await fixture.resume(true, EXTERNAL_PRINCIPAL);

      expect(fixture.onlyProposal().decision).toBeUndefined();
    });

    it('should still let an authenticated approver decide afterwards', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      await fixture.resume(true, EXTERNAL_PRINCIPAL);

      await fixture.resume(false, 'analyst');

      const proposal = fixture.onlyProposal();
      expect(proposal.decision).toBe('dismissed');
      expect(proposal.decidedBy?.username).toBe('analyst');
    });
  });

  describe('a failing action', () => {
    // The action workflow does not exist in this harness, so `workflow.execute`
    // fails — which is the branch worth exercising, because a successful action
    // needs no recovery.
    it('should settle the attempt as approved and failed', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      const failed = fixture.proposals()[0];
      expect(failed.decision).toBe('approved');
      expect(failed.status).toBe('failed');
      expect(failed.executionError).toEqual(expect.any(String));
    });

    it('should re-offer the subject as a fresh proposal and park again', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      const [original, clone] = fixture.proposals();
      expect(clone).toBeDefined();
      expect(original.supersededBy).toBe(clone.id);
      expect(clone.decision).toBeUndefined();
      expect(clone.status).toBe('pending');
      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should inherit the deadline so a chain of retries cannot outlive it', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      const [original, clone] = fixture.proposals();
      expect(clone.expiresAt).toBe(original.expiresAt);
      expect(clone.createdAt).toBe(original.createdAt);
    });

    it('should point the clone at the same parked execution', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      const [, clone] = fixture.proposals();
      expect(clone.workflowExecutionId).toBe('fake_workflow_execution_id');
    });

    it('should let the clone be dismissed on the next answer', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      await fixture.resume(true);

      await fixture.resume(false);

      const [original, clone] = fixture.proposals();
      // The original keeps the outcome it already settled on.
      expect(original.status).toBe('failed');
      expect(clone.decision).toBe('dismissed');
      expect(clone.status).toBe('no_action');
      expect(fixture.executionStatus()).toBe(ExecutionStatus.COMPLETED);
    });
  });

  describe('a gate nobody answers', () => {
    it('should settle as expired once the gate times out', async () => {
      await fixture.start();
      await fixture.timeOutGate();

      const proposal = fixture.onlyProposal();
      expect(proposal.status).toBe('expired');
      // Nobody answered, so there is no decision to record — `expired` is the
      // only terminal status an undecided proposal has.
      expect(proposal.decision).toBeUndefined();
      expect(proposal.decidedBy).toBeUndefined();
    });

    it('should complete rather than fail, since a timeout is an expected end', async () => {
      await fixture.start();
      await fixture.timeOutGate();

      // The step-level handler on the gate is what makes this `completed`:
      // without it the workflow-level handler settles the record but ends the
      // run as `failed` and skips the output step.
      expect(fixture.executionStatus()).toBe(ExecutionStatus.COMPLETED);
    });

    it('should not read a timed-out gate as a dismissal', async () => {
      await fixture.start();
      await fixture.timeOutGate();

      // A timed-out gate answers blank, which the dismissal branch would
      // otherwise record as a decision nobody made.
      expect(fixture.onlyProposal().dismissReason).toBeUndefined();
      expect(fixture.stepExecutions('record_dismissal')).toHaveLength(0);
    });

    it('should carry the timeout onto the record, so the queue can say why', async () => {
      await fixture.start();
      await fixture.timeOutGate();

      expect(fixture.onlyProposal().executionError).toContain('timeout');
    });
  });

  describe('autonomy', () => {
    it('should skip the gate for an action the caller already authorised', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, autoApprove: true });

      // Never parked: the first proposal was decided without a human, and its
      // action failed, so it was re-offered — this time gated.
      const [first] = fixture.proposals();
      expect(first.decision).toBe('approved');
      expect(fixture.stepExecutions('await_decision', 'waitForApproval')).toHaveLength(1);
      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should still gate a proposal with no action, whatever the flag says', async () => {
      await fixture.start({ autoApprove: true });

      // Approval is the entire lifecycle here, so there is no autonomy to
      // resolve and the flag is deliberately ignored.
      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
      expect(fixture.onlyProposal().decision).toBeUndefined();
    });

    it('should still gate an always-gate action the caller tried to authorise', async () => {
      fixture.setActionMetadata({
        name: 'Create rule',
        category: 'tune',
        approvalPolicy: 'always-gate',
      });

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, autoApprove: true });

      // The action's own declaration outranks whatever autonomy the caller
      // resolved, so a Worker cannot auto-approve it by mistake.
      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
      expect(fixture.onlyProposal().decision).toBeUndefined();
    });

    it('should gate when the action metadata could not be read at all', async () => {
      fixture.failActionLookup();

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, autoApprove: true });

      // Creation swallows the read failure, so an unreadable policy is
      // indistinguishable from a permissive one — a transient outage must not
      // be what lets an action run unattended.
      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
      expect(fixture.onlyProposal().decision).toBeUndefined();
    });

    it('should skip the gate for an autonomy-dependent action', async () => {
      fixture.setActionMetadata({
        name: 'Create rule',
        category: 'tune',
        approvalPolicy: 'autonomy-dependent',
      });

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, autoApprove: true });

      // Declaring the policy explicitly must behave like declaring nothing;
      // only `always-gate` overrides the caller.
      expect(fixture.proposals()[0].decision).toBe('approved');
    });
  });

  describe('caller provenance', () => {
    const REVIEW = {
      context: { parentWorkflowExecutionId: 'exec-runner' },
      id: 'exec-review',
      isTestRun: false,
      managed: true,
      managedBy: 'alertzero',
      spaceId: 'fake_space_id',
      workflowId: 'wf-review',
    };
    const RUNNER = {
      ...REVIEW,
      context: { parent: { executionId: 'exec-floor', workflowId: 'wf-floor' } },
      id: 'exec-runner',
      workflowId: 'wf-runner',
    };
    const FLOOR = { ...REVIEW, context: {}, id: 'exec-floor', workflowId: 'wf-floor' };

    it('should record the calling workflow, its manager and the root of its run', async () => {
      fixture.setCallerLineage([REVIEW, RUNNER, FLOOR]);

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      expect(fixture.onlyProposal()).toEqual(
        expect.objectContaining({
          callerManagedBy: 'alertzero',
          callerRunId: 'exec-floor',
          callerWorkflowExecutionId: 'exec-review',
          callerWorkflowId: 'wf-review',
        })
      );
    });

    it('should record no manager for a caller no plugin manages', async () => {
      fixture.setCallerLineage([{ ...FLOOR, managed: false, managedBy: null }]);

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      expect(fixture.onlyProposal().callerManagedBy).toBeUndefined();
    });

    it('should still create the proposal when an ancestor cannot be read', async () => {
      // The runner is missing, so the run root is unknown: a best-effort field
      // must never be what stops the gate.
      fixture.setCallerLineage([REVIEW]);

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      const proposal = fixture.onlyProposal();
      expect(proposal.callerWorkflowExecutionId).toBe('exec-review');
      expect(proposal.callerRunId).toBeUndefined();
      expect(fixture.executionStatus()).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should record no caller for a gate run directly', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      expect(fixture.onlyProposal().callerWorkflowExecutionId).toBeUndefined();
    });

    it('should carry the caller onto a retry, which continues the same run', async () => {
      fixture.setCallerLineage([REVIEW, RUNNER, FLOOR]);
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      const [, clone] = fixture.proposals();
      expect(clone.callerRunId).toBe('exec-floor');
    });

    it.each([
      [true, true],
      [undefined, false],
    ])(
      'should record autoApproveRequested as %p when the caller passes %p',
      async (autoApprove, expected) => {
        await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, autoApprove });

        expect(fixture.proposals()[0].autoApproveRequested).toBe(expected);
      }
    );
  });

  describe('attempts', () => {
    it('should start at the first attempt and count a retry as the next', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      const [original, clone] = fixture.proposals();
      expect([original.attempt, clone.attempt]).toEqual([1, 2]);
    });
  });

  describe('decision source', () => {
    it('should attribute a dismissal to a human', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(false);

      expect(fixture.onlyProposal().decisionSource).toBe('human');
    });

    it('should attribute an approval through the gate to a human', async () => {
      await fixture.start();

      await fixture.resume(true);

      expect(fixture.onlyProposal().decisionSource).toBe('human');
    });

    it('should attribute an approval the caller authorised to autonomy', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, autoApprove: true });

      expect(fixture.proposals()[0].decisionSource).toBe('autonomy');
    });

    it('should attribute the gated retry of an autonomous approval to a human', async () => {
      // The autonomy pass leaves `decision_source` set; the gated pass after
      // the failed action must overwrite it rather than inherit it.
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, autoApprove: true });

      await fixture.resume(false);

      const [, clone] = fixture.proposals();
      expect(clone.decisionSource).toBe('human');
    });

    it('should leave the decision source of the failed original on the original only', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      const [original, clone] = fixture.proposals();
      expect([original.decisionSource, clone.decisionSource]).toEqual(['human', undefined]);
    });
  });

  describe('settle path', () => {
    it('should record a timed-out gate as settled by the deadline', async () => {
      await fixture.start();
      await fixture.timeOutGate();

      expect(fixture.onlyProposal().settledBy).toBe('deadline');
    });

    it('should record a spent attempt budget as settled by the iteration limit', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID }, { maxIterations: 1 });
      fixture.setCanDecide(false);

      await fixture.resume(true);

      const proposal = fixture.onlyProposal();
      expect([proposal.status, proposal.settledBy]).toEqual(['expired', 'iteration_limit']);
    });

    it('should record a failed run as settled by the workflow failure', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      fixture.failPrivilegeCheck();

      await fixture.resume(true);

      const proposal = fixture.onlyProposal();
      expect([proposal.status, proposal.settledBy]).toEqual(['expired', 'workflow_failure']);
    });

    it('should record nothing for an outcome the loop wrote itself', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(false);

      expect(fixture.onlyProposal().settledBy).toBeUndefined();
    });

    it('should not reattribute an action failure the loop already recorded', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      expect(fixture.proposals()[0].settledBy).toBeUndefined();
    });
  });

  describe('telemetry', () => {
    const EXTERNAL_PRINCIPAL = 'external_resume:step-exec-1';

    /** The engine fixture runs in a non-default space, with no calling workflow by default. */
    const CUSTOM_CALLER = { consumer: 'custom', is_default_space: false, managed_caller: false };

    const eventTypes = () => fixture.reportedEvents().map(({ eventType }) => eventType);

    /** The id fields of the `index`-th proposal written; every chain here is rooted at the first. */
    const idFieldsOf = (index = 0) => {
      const all = fixture.proposals();
      return { proposal_id: all[index].id, root_proposal_id: all[0].id };
    };

    const payloadOf = (eventType: string) =>
      fixture.reportedEvents().find((event) => event.eventType === eventType)?.payload;

    afterEach(() => {
      // Every payload the gate produced passed the dev-mode schema validation.
      expect(fixture.rejectedReports()).toEqual([]);
    });

    it('should report a human approval, its failed action and the retry', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      expect(eventTypes()).toEqual([
        'proposals_proposal_created',
        'proposals_proposal_decided',
        'proposals_proposal_status_changed',
        'proposals_proposal_status_changed',
        'proposals_action_executed',
        'proposals_proposal_retried',
      ]);
      expect(payloadOf('proposals_proposal_decided')).toEqual({
        ...CUSTOM_CALLER,
        ...idFieldsOf(0),
        attempt: 1,
        decided_after_deadline: false,
        decision: 'approved',
        decision_source: 'human',
        time_to_decision_ms: expect.any(Number),
      });
      expect(
        fixture
          .reportedEvents()
          .filter(({ eventType }) => eventType === 'proposals_proposal_status_changed')
          .map(({ payload }) => payload)
      ).toEqual([
        { ...CUSTOM_CALLER, ...idFieldsOf(0), from_status: 'pending', to_status: 'executing' },
        {
          ...CUSTOM_CALLER,
          ...idFieldsOf(0),
          failure_source: 'action',
          from_status: 'executing',
          to_status: 'failed',
        },
      ]);
      expect(payloadOf('proposals_action_executed')).toEqual(
        expect.objectContaining({
          ...idFieldsOf(0),
          action_id: 'custom',
          attempt: 1,
          outcome: 'failed',
        })
      );
      // The clone's own id, with the chain root it inherited from the original.
      expect(payloadOf('proposals_proposal_retried')).toEqual({
        ...CUSTOM_CALLER,
        ...idFieldsOf(1),
        attempt: 2,
      });
    });

    it("should carry each proposal's own id and its chain root on every event", async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true);

      const [original, clone] = fixture.proposals();
      expect(clone.id).not.toBe(original.id);
      expect(
        fixture
          .reportedEvents()
          .map(({ eventType, payload }) => [
            eventType,
            'proposal_id' in payload ? payload.proposal_id : undefined,
            'root_proposal_id' in payload ? payload.root_proposal_id : undefined,
          ])
      ).toEqual([
        ['proposals_proposal_created', original.id, original.id],
        ['proposals_proposal_decided', original.id, original.id],
        ['proposals_proposal_status_changed', original.id, original.id],
        ['proposals_proposal_status_changed', original.id, original.id],
        ['proposals_action_executed', original.id, original.id],
        ['proposals_proposal_retried', clone.id, original.id],
      ]);
    });

    it("should report a managed action's origin definition id as the action id", async () => {
      fixture.setManagedAction('alertzero-action-create-rule');

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      await fixture.resume(true);

      expect(fixture.proposals()[0].actionId).toBe('alertzero-action-create-rule');
      expect(payloadOf('proposals_proposal_created')).toEqual(
        expect.objectContaining({ action_id: 'alertzero-action-create-rule' })
      );
      expect(payloadOf('proposals_action_executed')).toEqual(
        expect.objectContaining({ action_id: 'alertzero-action-create-rule' })
      );
    });

    it('should report a custom action as custom, never by its workflow id', async () => {
      await fixture.start({ actionWorkflowId: 'secret-customer-workflow' });
      await fixture.resume(true);

      expect(payloadOf('proposals_proposal_created')).toEqual(
        expect.objectContaining({ action_id: 'custom' })
      );
      expect(payloadOf('proposals_action_executed')).toEqual(
        expect.objectContaining({ action_id: 'custom' })
      );
      expect(JSON.stringify(fixture.reportedEvents())).not.toContain('secret-customer-workflow');
    });

    it('should report the created proposal', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      expect(fixture.reportedEvents()).toEqual([
        {
          eventType: 'proposals_proposal_created',
          payload: {
            ...CUSTOM_CALLER,
            ...idFieldsOf(0),
            action_id: 'custom',
            auto_approve_requested: false,
            // The fixture's action declares `tune`, outside the known vocabulary.
            category: 'other',
            confidence_bucket: 'medium',
            expires_in_bucket: 'le_72h',
            has_action: true,
            impact_class: 'low',
          },
        },
      ]);
    });

    it('should report a dismissal', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(false);

      expect(eventTypes()).toEqual([
        'proposals_proposal_created',
        'proposals_proposal_decided',
        'proposals_proposal_status_changed',
      ]);
      expect(payloadOf('proposals_proposal_decided')).toEqual(
        expect.objectContaining({ decision: 'dismissed', decision_source: 'human' })
      );
      expect(payloadOf('proposals_proposal_status_changed')).toEqual({
        ...CUSTOM_CALLER,
        ...idFieldsOf(0),
        from_status: 'pending',
        to_status: 'no_action',
      });
    });

    it('should report an autonomy approval without a time to decision', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID, autoApprove: true });

      expect(payloadOf('proposals_proposal_created')).toEqual(
        expect.objectContaining({ auto_approve_requested: true })
      );
      const decided = payloadOf('proposals_proposal_decided');
      expect(decided).toEqual(expect.objectContaining({ decision_source: 'autonomy' }));
      expect(decided).not.toHaveProperty('time_to_decision_ms');
    });

    it('should report a late decision through the generic resume', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resumeAfterDeadline(true);

      expect(payloadOf('proposals_proposal_decided')).toEqual(
        expect.objectContaining({ decided_after_deadline: true, decision_source: 'human' })
      );
    });

    it('should report an unanswered gate as expired by the deadline', async () => {
      await fixture.start();
      await fixture.timeOutGate();

      expect(eventTypes()).toEqual([
        'proposals_proposal_created',
        'proposals_proposal_status_changed',
      ]);
      expect(payloadOf('proposals_proposal_status_changed')).toEqual({
        ...CUSTOM_CALLER,
        ...idFieldsOf(0),
        expiry_reason: 'deadline',
        from_status: 'pending',
        to_status: 'expired',
      });
    });

    it('should report a spent attempt budget as expired by the iteration limit', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID }, { maxIterations: 1 });
      fixture.setCanDecide(false);

      await fixture.resume(true);

      expect(payloadOf('proposals_proposal_status_changed')).toEqual(
        expect.objectContaining({ expiry_reason: 'iteration_limit', to_status: 'expired' })
      );
    });

    it('should report a failed run as expired by the workflow failure', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      fixture.failPrivilegeCheck();

      await fixture.resume(true);

      expect(eventTypes()).toEqual([
        'proposals_proposal_created',
        'proposals_proposal_status_changed',
      ]);
      expect(payloadOf('proposals_proposal_status_changed')).toEqual(
        expect.objectContaining({ expiry_reason: 'workflow_failure', to_status: 'expired' })
      );
    });

    it('should report an unprivileged resumer as a rejected resume, and nothing else', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      fixture.setCanDecide(false);

      await fixture.resume(true);

      expect(fixture.reportedEvents().slice(1)).toEqual([
        {
          eventType: 'proposals_proposal_resume_rejected',
          payload: { ...CUSTOM_CALLER, ...idFieldsOf(0), reason: 'unprivileged' },
        },
      ]);
    });

    it('should report an external resume as a rejected resume', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.resume(true, EXTERNAL_PRINCIPAL);

      expect(fixture.reportedEvents().slice(1)).toEqual([
        {
          eventType: 'proposals_proposal_resume_rejected',
          payload: { ...CUSTOM_CALLER, ...idFieldsOf(0), reason: 'external_principal' },
        },
      ]);
    });

    it('should report a revision, and no status change for the superseded predecessor', async () => {
      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });

      await fixture.revise({ comment: 'Tune the noisier rule' });

      expect(fixture.reportedEvents().slice(1)).toEqual([
        {
          eventType: 'proposals_proposal_revised',
          // The new revision's own id, with the chain root it inherited.
          payload: {
            ...CUSTOM_CALLER,
            ...idFieldsOf(1),
            action_input_changed: false,
            comment_changed: true,
            confidence_changed: false,
            impact_changed: false,
            revision: 2,
          },
        },
      ]);
    });

    it("should carry a managed caller's provenance on every event", async () => {
      const FLOOR = {
        context: {},
        id: 'exec-floor',
        isTestRun: false,
        managed: true,
        managedBy: 'alertzero',
        spaceId: 'fake_space_id',
        workflowId: 'wf-floor',
      };
      fixture.setCallerLineage([FLOOR]);

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      await fixture.resume(false);

      expect(fixture.reportedEvents().map(({ payload }) => payload)).toEqual(
        Array(3).fill(
          expect.objectContaining({
            caller_run_id: 'exec-floor',
            consumer: 'alertzero',
            is_default_space: false,
            managed_caller: true,
          })
        )
      );
    });

    it('should report a test run of a managed caller as custom on every event', async () => {
      // A test run copies the managed identity of the workflow it tests; its
      // gate is not the managing plugin's own use of proposals.
      const TEST_RUN_FLOOR = {
        context: {},
        id: 'exec-floor-test',
        isTestRun: true,
        managed: true,
        managedBy: 'alertzero',
        spaceId: 'fake_space_id',
        workflowId: 'wf-floor',
      };
      fixture.setCallerLineage([TEST_RUN_FLOOR]);

      await fixture.start({ actionWorkflowId: ACTION_WORKFLOW_ID });
      await fixture.resume(false);

      expect(fixture.reportedEvents().map(({ payload }) => payload)).toEqual(
        Array(3).fill(
          expect.objectContaining({
            caller_run_id: 'exec-floor-test',
            consumer: 'custom',
            is_default_space: false,
            managed_caller: false,
          })
        )
      );
    });
  });
});
