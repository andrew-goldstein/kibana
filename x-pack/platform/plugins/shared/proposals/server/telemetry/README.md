# Proposals telemetry

Event-Based Telemetry (EBT) events registered by the `proposals` plugin. They go through core analytics (`core.analytics`), so opted-out clusters send nothing. The events are registered once in `setup()`. See the plugin [README](../../README.md).

Gate reliability (a gate workflow that failed, was cancelled or timed out) is not duplicated here. It comes from the Workflows engine's own terminal execution events for the `system-create-proposal` workflow. Proposals events cover what the engine cannot know: what was proposed, who decided and how, and where each proposal settled.

## Privacy contract

- **No identities.** No event carries a user name, email, profile uid, role, API key, or anything read from a `KibanaRequest`. `decidedBy` and `createdBy` never ship. The static test in `event_types.test.ts` fails if any file in this directory imports `KibanaRequest` or `ProposalUser`, so audit data stays out by construction. Audit logging is a separate pipeline.
- **No free text.** Every field is a closed enum, a bounded count, a boolean, a duration, a day, or a system-generated id. The title, comment, rationale, action input, execution error and previous execution error never ship; a revision reports only *whether* the comment and action input changed. No payload builder reads `title` or `previousExecutionError` at all: the service hands the builders a `ProposalTelemetryRecord`, which leaves both out, built by `toTelemetryRecord` field by field from the stored record, and `payload_builders_privacy.test.ts` fails if that path reads either from a stored record. The open action `category` keyword ships only when it is in a known vocabulary, and as `other` otherwise. No field uses the `text` type.
- **No space ids.** Events carry `is_default_space` instead.
- **What a join reaches.** "No space ids" holds only within the proposals events. `workflow_execution_id` joins to the Workflows engine's own run events (`workflows_execution_workflow_completed`, `_failed` and `_cancelled`) for the gate run, and through their lineage fields to the run that asked for the proposal and its other runs. Those events already carry the raw `spaceId` and `workflowId` (for a custom workflow, usually derived from its name), the `ruleId` of a rule-triggered run, and two free-text fields: `errorMessage` on a failed run and `cancellationReason` on a cancelled one. The engine's `errorMessage` for a failed action run carries the same text the gate stores as `executionError` and a retry carries as `previousExecutionError`, which these events never ship themselves. All of these are existing engine fields, outside this plugin.
- **No custom workflow ids.** The action workflow id and the calling workflow id never ship. The caller is described only by the proposal's own `origin` (a closed enum) and the gate run's `workflow_execution_id`, whose engine event says whether its run is managed. The action ships only as `action_id`: the registered managed workflow definition id it was installed from (its `originManagedWorkflowId`, which only a managed install records), or `custom` for a workflow no plugin manages.
- **One caller-asserted field.** `decision_source` comes from the `decisionSource` input of `proposals.updateProposal`, which any workflow calling that step can set, so it reports what the caller says happened, not a server check. Everything else is derived on the server: `expiry_reason` and `failure_source` from which write settled the proposal and when (no input names them), `action_id` from the action read, and `revision_source` from the surface that called `revise()`. `origin` is the proposal's stored value, which its creator declared (see [Common fields](#common-fields)).
- **System ids ship raw.** `workflow_execution_id` is a generated execution UUID that the Workflows engine already ships. `proposal_id` and `root_proposal_id` are generated proposal UUIDs: `create()`, `clone()` and `revise()` each mint one with `uuidv4()`, unless a `create()` caller supplies its own ([#295212](https://github.com/elastic/kibana/pull/295212)). The Hunt Worker does: it derives the id with `uuidv5` from the space, the producer, the proposed subject (the host, process, user or service, plus the action) and a generation number, so its `proposal_id` names no entity in clear text, but anyone with the source and a candidate host name could recompute it. `conversation_id` is the Agent Builder conversation id the proposal belongs to, which Agent Builder already ships as its own `conversation_id`. It is usually a random UUID, but a caller may supply its own (see [Proposal id fields](#proposal-id-fields)). Like the other ids, it ships raw pending the privacy review's ruling on generated ids.
- **Closed schemas.** No field is `pass_through`. In dev mode, a payload with an undeclared key throws, and the schema tests check this.
- **Never throw.** Every emission goes through `safeReportEvent`, which catches everything and logs at debug level, so telemetry cannot fail the write it follows. Emitters report after their write resolves, never inside an optimistic-concurrency callback, and only on a real transition diffed against the loaded document.

The schema tests (`event_types.test.ts`) enforce the following:
- every field has a description, and every event carries the common fields (requiring `origin` and `is_default_space`) and requires all three proposal id fields;
- only `proposals_proposal_created` declares `action_id`;
- no field is `text` or `pass_through`;
- no field name is in the denylist (`user`, `username`, `email`, `name`, `title`, `message`, `rationale`, `comment`, `description`, `space_id`, `spaceId`, `decidedBy`, `executionError`, `previousExecutionError`, `previous_execution_error`, `actionInput`);
- this README documents exactly the registered events;
- a valid payload per event passes a dev-mode analytics client, and one with an undeclared key is rejected.

## Module

| File | Contents |
|---|---|
| `constants.ts` | `PROPOSALS_TELEMETRY_PREFIX`, the `PROPOSALS_TELEMETRY_EVENTS` name map, and the closed vocabularies |
| `event_types.ts` | One `EventTypeOpts` and one payload type per event, plus `PROPOSALS_TELEMETRY_EVENT_TYPES` |
| `register_telemetry_events.ts` | `registerProposalsTelemetryEvents(analytics)`, called once in `setup()` |
| `safe_report_event.ts` | `safeReportEvent` and `createProposalsTelemetryReporter`, the never-throw reporters; both return whether the event was reported |
| `bucket_duration.ts`, `bucket_expires_in.ts` | The duration buckets behind `expires_in_bucket` |
| `to_telemetry_category.ts` | Maps the open action category onto the closed vocabulary |
| `is_default_space.ts`, `build_common_fields.ts` | The common fields, from the stored `origin`, space and gate execution |
| `build_proposal_id_fields.ts` | `proposal_id`, `root_proposal_id` and `conversation_id`, from the stored record |
| `to_telemetry_record.ts` | `toTelemetryRecord`, the builders' view of a stored proposal: its public fields, and the write-time context (`actionId`, `decisionSource`, `revisionSource`, `settlePath`) that is reported but not stored |
| `to_telemetry_action_id.ts` | The `action_id` creation reports: a managed action workflow's definition id, or `custom` |
| `to_expiry_reason.ts` | The `expiry_reason` a settling write stands for, from its settle path and the deadline |
| `to_failure_source.ts` | The `failure_source` a failing write stands for, from its settle path |
| `build_*_payload.ts` | One pure payload builder per event, from the stored record (never the stripped public proposal). `payload_builders_privacy.test.ts` checks that none of them reads `title` or `previousExecutionError` |
| `build_update_events.ts` | The events one `update()` write produces, diffed from the loaded record to the written one |
| `to_resume_rejected_reason.ts` | The `resume_rejected` reason a refusal error stands for |
| `types.ts` | `ProposalTelemetryRecord` (the stored fields the builders read) and `ProposalsTelemetryEvent` |

## Where each event is emitted

`ProposalsService` takes an optional `telemetry` reporter (built in `start()` from `core.analytics`) and reports after each write resolves. Building the payload runs inside the same never-throw guard as reporting it.

| Event | Emitted by | When |
|---|---|---|
| `proposals_proposal_created` | `create()` | After the proposal is indexed |
| `proposals_proposal_decided` | `update()` | The write that first records a decision |
| `proposals_proposal_status_changed` | `update()`, and the settle `get()`, `list()` and `releaseGate()` write through it for a gate that ended | The loaded status differs from the written one. A same-status rewrite (the failure handler writing `failed` onto `failed`) sends nothing |
| `proposals_action_executed` | `update()` | An `executing` proposal moves to `succeeded` or `failed` by the loop's own outcome write |
| `proposals_proposal_retried` | `clone()` | After both the clone and the superseded original are written |
| `proposals_proposal_revised` | `revise()` | After both the revision and the superseded predecessor are written. A revision that loses its race and is retired sends nothing |
| `proposals_proposal_resume_rejected` | `releaseGate()` | A typed refusal: `already_decided`, `settled`, `past_deadline`, `input_changed`, `no_execution` or `not_waiting` |
| `proposals_proposal_resume_rejected` | the `proposals.checkDecidePrivileges` step, through `reportResumeRejected()` | `external_principal` or `unprivileged`, behind the gate |

One approval can send several events of different types (for example `decided` and `status_changed` from the write that records the approval and starts the action), but never two of the same type for one write.

Semantics decided at the emission points:
- **`decision_source` without a recorded source** reads as `unknown`, not `human`. It happens only for a gate parked under an older definition (an autonomy decision never parks) or a direct step call.
- **The settle path** is known only to the write that settles a proposal outside the loop, and is never stored or taken from an input: `proposals.settleIncompleteProposal` passes `gate`, `proposals.updateProposal` passes `external` whenever it writes `expired`, and the service passes `gate_ended` when a read or a decision finds the gate execution cancelled or timed out ([#297791](https://github.com/elastic/kibana/pull/297791)): such a gate runs no handler, so nothing else settles its proposal. Only the write that actually moves the record to a terminal status carries it, so the failure handler re-writing `failed` cannot reattribute an outcome the loop recorded.
- **`expiry_reason`** follows from it. `external` is an expiry from outside the gate: today, the Rule Tuning Worker expiring a pending proposal whose rule was changed or deleted ([#296131](https://github.com/elastic/kibana/pull/296131)). A gate settle is `deadline` when it lands at or after `expiresAt`, allowing 1s (`DEADLINE_TOLERANCE_MS`) because the gate waits in whole seconds, and `settled_early` otherwise: the gate's attempt budget ran out, or its workflow-level failure handler ran. The gate run's own engine event tells those two apart (`_failed` for a workflow failure). `gate_ended` is a gate cancelled or timed out before anyone decided, settled whenever the proposal is next read or decided, so the time it lands says nothing about the deadline.
- **`failure_source`** is `action` when the loop recorded the failure itself, `workflow_failure` when the gate's settle did (the gate settles a decided proposal as `failed` only from its workflow-level failure handler), and `gate_ended` when the gate execution was cancelled or timed out while the action ran.
- **`revision_source`** is passed to `revise()` by its caller and not stored: `http_api` from the internal revise route, `agent` from the Agent Builder revise tool. A call without one (an in-process server caller, today only the Hunt Worker's "Also raised by", [#297140](https://github.com/elastic/kibana/pull/297140)) reads as `server_api`.
- **`proposals_action_executed`** is sent only for an outcome the loop recorded. A gate failure or an ended gate settled onto a running action sends its `status_changed` (with `failure_source: workflow_failure` or `gate_ended`) and no `action_executed`, because the action's own outcome is unknown.
- **`time_to_decision_ms`** is still sent for a late decision, together with `decided_after_deadline: true`.
- **`past_deadline`** is a decision `releaseGate()` refused because the deadline passed while the live gate had not yet expired the proposal. The gate expires it itself, so the refusal settles nothing.
- **`action_id`** is resolved in `create()`, from the action read it already makes for the metadata and input check, and reported on `proposals_proposal_created` only. Retries and revisions keep the same action, so later events of the chain join to it by `root_proposal_id`. It is absent when the action could not be read: unknown, rather than a guess. Nothing is stored for telemetry.
- **`reportResumeRejected`** reads the refused proposal only while telemetry is opted in (read with a 1s timeout that reads as opted out), since it reads it only to build the event. No other path reads anything for telemetry.

## Common fields

Every event carries these fields.

| Field | Type | Required | Description |
|---|---|---|---|
| `origin` | keyword | yes | The feature that produced the proposal (`alertzero`, `nightshift`, `context_engine` or `agent_builder`): the proposal's own stored `origin`, which every retry and revision inherits. Declared by the caller |
| `workflow_execution_id` | keyword | no | The gate execution the proposal was created in (its stored `workflowExecutionId`), which every retry and revision inherits. Absent for a proposal created outside a workflow |
| `is_default_space` | boolean | yes | Whether the proposal is in the default space |

## Joining a proposal to the run that asked for it

The proposals plugin reads no executions for telemetry. Who asked for a proposal comes from the Workflows engine's own run events, joined on `workflow_execution_id` by the engine's [join rule](../../../../../../../src/platform/plugins/shared/workflows_execution_engine/docs/telemetry.md#join-rule) ([#297902](https://github.com/elastic/kibana/pull/297902)):

- The gate run's terminal event (`workflowExecutionId` equal to `workflow_execution_id`) carries `isTestRun`, `isManaged` and `managedBy` for the gate, and its `executionChain`: every run above the gate, root first and the run that started the gate last, each with its execution id and workflow id.
- The chain's first hop is the root, the top-level run the gate belongs to. For an AlertZero Worker that is the Worker's run, whose execution id the Worker's own events report as `run_id`, so they join directly. The last hop is the run that started the gate, for AlertZero the `system-create-alertzero-proposal` wrapper. Each hop's own run event says whether that run was managed.
- A gate started directly, with no calling workflow (the `proposals.create` agent tool, or a manual run), has no chain: it is its own root.
- Agent Builder's round events also carry a `workflow_execution_id`, but theirs is the run whose `ai.agent` step started the round, never a gate, so the two never join on equal values.

What the join implies:
- The engine reports a run only when it ends, so a proposal joins to its run when its gate run ends: minutes after a decision, at the deadline when nobody decides, and never when the gate ends without a terminal event (the engine's [join rule](../../../../../../../src/platform/plugins/shared/workflows_execution_engine/docs/telemetry.md#join-rule) lists when that happens).
- It checks the root, not every run between the root and the gate: a dashboard that keeps only managed roots excludes custom workflows that call the gate themselves, but not a custom workflow in the middle of a managed chain.
- Proposals created while telemetry was opted out still join, because the gate execution id is stored on every proposal anyway.

## Proposal id fields

Every event also carries these fields, so a dashboard can follow one proposal from created to decided to executed, group a whole chain of retries and revisions, and group every proposal made in one conversation.

| Field | Type | Required | Description |
|---|---|---|---|
| `proposal_id` | keyword | yes | The generated id of the proposal the event is about. A retry or a revision is a new proposal: `proposals_proposal_retried` and `proposals_proposal_revised` carry the new one's id |
| `root_proposal_id` | keyword | yes | The generated id of the first proposal in the chain, which every retry and revision inherits. Equals `proposal_id` for the first proposal |
| `conversation_id` | keyword | yes | The Agent Builder conversation the proposal belongs to (its stored `conversationId`), which every retry and revision inherits. For AlertZero this is the Investigation id |

`conversation_id` joins a proposal to its conversation's own events, such as Agent Builder's rounds (which carry the same `conversation_id`) and, for AlertZero, the Investigation events (`investigation_id`). Agent Builder mints a random UUID when no id is given, but a caller may supply its own: the AlertZero Attack Discovery Worker uses a shortened form of the attack's alert id, and the Hunt Worker a UUID derived from the threat report's id. So it can name a customer record, never a person. It ships raw, like the other generated ids, pending the same privacy ruling.

## Vocabularies

- **Duration buckets** are upper-inclusive: `le_1h`, `le_24h`, `le_72h`, `le_7d`, `gt_7d`. The default 72h deadline is `le_72h`.
- **Attempts** are not reported as a field: a chain's attempt count is one plus the number of `proposals_proposal_retried` events sharing its `root_proposal_id`.
- **`category`** is `configure`, `investigate`, `respond` or `other`. Absent when the proposal has none.
- **`action_id`** is the registered managed workflow definition id an action workflow was installed from, or `custom` for any workflow no plugin manages. It is never a customer-chosen workflow id.

## Events

### `proposals_proposal_created`

A proposal was created.

| Field | Type | Required | Description |
|---|---|---|---|
| common fields | | | See above |
| proposal id fields | | | See above |
| `action_id` | keyword | no | The action workflow's managed definition id, or `custom` (see Vocabularies). Absent without an action, or when the action could not be read |
| `expires_in_bucket` | keyword | yes | Decision window from creation to the deadline, as a duration bucket, or `none` without a deadline |
| `has_action` | boolean | yes | Whether approval runs an action workflow |
| `category` | keyword | no | The action category (see Vocabularies) |
| `impact_class` | keyword | yes | `low`, `medium`, `high` or `critical` |
| `confidence_bucket` | keyword | yes | `low`, `medium` or `high` |

### `proposals_proposal_decided`

A decision was first recorded on a proposal.

| Field | Type | Required | Description |
|---|---|---|---|
| common fields | | | See above |
| proposal id fields | | | See above |
| `decision` | keyword | yes | `approved` or `dismissed` |
| `decision_source` | keyword | yes | `human`; `autonomy` when the caller's autonomy policy auto-approved the gate; or `unknown` when the decision was recorded without a source. Reported by the calling workflow (see Caller-asserted fields in the privacy contract) |
| `decided_after_deadline` | boolean | yes | Whether the decision landed after the deadline. `releaseGate()` refuses a late decision (`resume_rejected` with `past_deadline`), but a decision that resumes the gate directly is accepted between the deadline and the gate settling the proposal `expired`, so it is flagged rather than refused |
| `dismiss_reason` | keyword | no | The dismiss reason enum (`no_reason`, `duplicate`, `false_positive`, `handled_elsewhere`, `risk_accepted`, `other`); dismissals only |
| `time_to_decision_ms` | long | no | Milliseconds from the chain root's creation to the decision; human decisions only |

### `proposals_proposal_status_changed`

A proposal's status really changed. A same-status rewrite sends nothing, and a move to `superseded` is reported as `proposals_proposal_revised` or `proposals_proposal_retried` instead.

| Field | Type | Required | Description |
|---|---|---|---|
| common fields | | | See above |
| proposal id fields | | | See above |
| `from_status` | keyword | yes | `pending`, `executing`, `succeeded`, `failed`, `expired`, `no_action` or `superseded` |
| `to_status` | keyword | yes | Same vocabulary, never `superseded` |
| `expiry_reason` | keyword | no | `deadline` or `settled_early` from the gate, `external` for an expiry written through `proposals.updateProposal`, outside the gate, or `gate_ended` for a gate cancelled or timed out before anyone decided; only when `to_status` is `expired` (see the emission semantics above) |
| `failure_source` | keyword | no | `action`, `workflow_failure` or `gate_ended`; only when `to_status` is `failed` |

### `proposals_action_executed`

An approved proposal's action finished.

| Field | Type | Required | Description |
|---|---|---|---|
| common fields | | | See above |
| proposal id fields | | | See above |
| `outcome` | keyword | yes | `succeeded` or `failed` |
| `category` | keyword | no | The action category |
| `execution_duration_ms` | long | no | Milliseconds from the approval to the outcome |

### `proposals_proposal_revised`

A pending proposal was revised, by an analyst or by the Hunt Worker, which appends "Also raised by" to the comment of a live proposal another Investigation's finding converges onto ([#297140](https://github.com/elastic/kibana/pull/297140)). Sent only after both the new revision and the superseded predecessor are written.

| Field | Type | Required | Description |
|---|---|---|---|
| common fields | | | See above |
| proposal id fields | | | See above |
| `revision` | long | yes | The new revision's 1-based position in its chain |
| `comment_changed` | boolean | yes | Whether the explanation was replaced |
| `action_input_changed` | boolean | yes | Whether the action input was overridden |
| `impact_changed` | boolean | yes | Whether the impact changed |
| `confidence_changed` | boolean | yes | Whether the confidence changed |
| `revision_source` | keyword | yes | Which surface asked for the revision: `http_api` (the internal revise route), `agent` (the Agent Builder revise tool) or `server_api` (an in-process server caller, such as the Hunt Worker) |

### `proposals_proposal_retried`

A proposal whose action failed was re-offered as a clone. Sent only after both writes.

| Field | Type | Required | Description |
|---|---|---|---|
| common fields | | | See above |
| proposal id fields | | | See above |

### `proposals_proposal_resume_rejected`

A decision attempt was refused. One event per attempt.

| Field | Type | Required | Description |
|---|---|---|---|
| common fields | | | See above |
| proposal id fields | | | See above |
| `reason` | keyword | yes | `already_decided`, `settled`, `past_deadline`, `input_changed`, `not_waiting`, `no_execution`, `unprivileged` or `external_principal`. A decision on a proposal the gate has already settled `expired` is `settled`, and one on a gate that has ended is `not_waiting` (its settle sends its own `status_changed`) |

## Known gaps

- Counts are lower bounds: EBT drops events on a full queue, a send failure or a crash.
- A gate that is cancelled or times out is settled (`gate_ended`) only when its proposal is next read or decided, so the `status_changed` can arrive long after the gate ended, or never for a proposal nobody opens again. A gate stranded by a restart is not in a terminal status, so it is not settled this way, and may send no terminal engine event either, so its proposal never joins to the run that asked for it.
- An unprivileged decision through the HTTP API is refused before the handler runs, so it sends no `resume_rejected`.
- A refused resume can be reported twice when Kibana restarts within moments of it and the gate step re-runs.
- A refusal that is not typed (a missing proposal, a lost annotation race, or the resume API failing) sends no `resume_rejected`.
- Only decisions through `releaseGate()` carry a `dismiss_reason` and can be refused with `already_decided`, `settled`, `past_deadline`, `input_changed`, `no_execution` or `not_waiting`: the proposals approve and dismiss routes, and the dismissals an Investigation close triggers. A decision that resumes the gate directly, through the generic workflow resume API or the workflow run view (which resumes a nested gate against its own run), is still reported as `decided`, but without `dismiss_reason`, and its refusals send no `resume_rejected`.
- Dismissals an Investigation close triggers are reported like an analyst's (`decision_source: human`); no field yet says which path a decision came through. The close itself sends Agent Builder's `agent_builder_conversation_fields_changed` (`status` to `closed`) for the same `conversation_id`, so a dashboard can match such dismissals to the close by time. That is a heuristic, not a field.
- `revision_source: server_api` covers any in-process `revise()` call that passes no source. Today that is only the Hunt Worker, but a later in-process caller is reported the same way unless it passes its own.
- `expiry_reason: external` says only that the expiry was written through `proposals.updateProposal`, outside the gate, not which workflow wrote it or why. Today only the Rule Tuning Worker does.
- `settled_early` doesn't say whether the gate's attempt budget ran out or its workflow failed; the gate run's engine event does, once it arrives.
- Who asked for a proposal is known only through the join above, so it lags until the gate run ends, and is lost when the gate run sends no terminal event. A chain whose runs started before [#297902](https://github.com/elastic/kibana/pull/297902) has no `executionChain`.
- A proposal an agent files with the `proposals.create` tool comes from a gate the tool starts directly, so its gate run has no chain and is its own root. Its `origin` is what the agent declared, and `conversation_id` ties it to the agent's conversation. When a workflow's `ai.agent` step ran that agent, the run that asked can still be found: the Agent Builder round with the same `conversation_id` whose `tools_invoked` lists `proposals.create` carries that run's `workflow_execution_id`, and its run event's `executionChain` leads to the root. A conversation in which the agent filed several proposals can only be matched by time, and a round started from chat has no run.
- `action_id` ships only on `created`: later events of a chain whose `created` event was lost don't join to an action.
