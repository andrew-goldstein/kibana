# Proposals telemetry

Event-Based Telemetry (EBT) events registered by the `proposals` plugin. They go through core analytics (`core.analytics`), so opted-out clusters send nothing. The events are registered once in `setup()`. See the plugin [README](../../README.md).

Gate reliability (a gate workflow that failed, was cancelled or timed out) is not duplicated here. It comes from the Workflows engine's own terminal execution events for the `system-create-proposal` workflow. Proposals events cover what the engine cannot know: what was proposed, who decided and how, where each proposal settled, and a daily view of what is still open.

## Privacy contract

- **No identities.** No event carries a user name, email, profile uid, role, API key, or anything read from a `KibanaRequest`. `decidedBy` and `createdBy` never ship. The static test in `event_types.test.ts` fails if any file in this directory imports `KibanaRequest` or `ProposalUser`, so audit data stays out by construction. Audit logging is a separate pipeline.
- **No free text.** Every field is a closed enum, a bounded count, a boolean, a duration, a day, or a system-generated id. The comment, rationale, action input and execution error never ship; a revision reports only *whether* they changed. The open action `category` keyword ships only when it is in a known vocabulary, and as `other` otherwise. No field uses the `text` type.
- **No space ids.** Events carry `is_default_space` instead.
- **No custom workflow ids.** The action workflow id and the calling workflow id never ship. The caller is described only by `consumer`: the plugin that manages it, or `custom`. The action ships only as `action_id`: the registered managed workflow definition id it was installed from (its `originManagedWorkflowId`, which only a managed install records), or `custom` for a workflow no plugin manages.
- **System ids ship raw.** `caller_run_id` is a generated execution UUID that the Workflows engine already ships. `proposal_id` and `root_proposal_id` are generated proposal UUIDs: `create()`, `clone()` and `revise()` each mint one with `uuidv4()`, and no request or step input can choose one.
- **Snapshots are cluster-level aggregates.** `proposals_snapshot` is summed across spaces and carries `space_count`, never a per-space breakdown, a proposal or action id, or a caller field.
- **Closed schemas.** No field is `pass_through`. In dev mode, a payload with an undeclared key throws, and the schema tests check this.
- **Never throw.** Every emission goes through `safeReportEvent`, which catches everything and logs at debug level, so telemetry cannot fail the write it follows. Emitters report after their write resolves, never inside an optimistic-concurrency callback, and only on a real transition diffed against the loaded document.

The schema tests (`event_types.test.ts`) enforce the following:
- every field has a description, and every event except the snapshot carries the caller fields and requires both proposal id fields;
- only `proposals_proposal_created` and `proposals_action_executed` declare `action_id`, and the snapshot declares no id at any depth;
- no field is `text` or `pass_through`;
- no field name is in the denylist (`user`, `username`, `email`, `name`, `title`, `message`, `rationale`, `comment`, `description`, `space_id`, `spaceId`, `decidedBy`, `executionError`, `actionInput`);
- this README documents exactly the registered events;
- a valid payload per event passes a dev-mode analytics client, and one with an undeclared key is rejected.

## Module

| File | Contents |
|---|---|
| `constants.ts` | `PROPOSALS_TELEMETRY_PREFIX`, the `PROPOSALS_TELEMETRY_EVENTS` name map, and the closed vocabularies |
| `event_types.ts` | One `EventTypeOpts` and one payload type per event, plus `PROPOSALS_TELEMETRY_EVENT_TYPES` |
| `register_telemetry_events.ts` | `registerProposalsTelemetryEvents(analytics)`, called once in `setup()` |
| `safe_report_event.ts` | `safeReportEvent` and `createProposalsTelemetryReporter`, the never-throw reporters; both return whether the event was reported |
| `resolve_proposal_consumer.ts` | `consumer` and `managed_caller` from the caller's persisted `managedBy` |
| `bucket_duration.ts`, `bucket_expires_in.ts` | The duration buckets behind `expires_in_bucket` and the snapshot's age buckets |
| `to_telemetry_category.ts` | Maps the open action category onto the closed vocabulary |
| `is_default_space.ts`, `build_caller_fields.ts` | The caller fields, from the stored provenance |
| `build_proposal_id_fields.ts` | `proposal_id` and `root_proposal_id`, from the stored record |
| `to_telemetry_action_id.ts` | The `action_id` the service stores at creation: a managed action workflow's definition id, or `custom` |
| `build_*_payload.ts` | One pure payload builder per event, from the stored record (never the stripped public proposal) |
| `build_update_events.ts` | The events one `update()` write produces, diffed from the loaded record to the written one |
| `to_resume_rejected_reason.ts` | The `resume_rejected` reason a refusal error stands for |
| `to_settled_reason.ts` | The snapshot's settled `reason` from a head's stored `settledBy`, matching the per-write `expiry_reason` and `failure_source` |
| `to_snapshot_day.ts` | The UTC `snapshot_day` of a snapshot run |
| `types.ts` | `ProposalTelemetryRecord` (the stored fields the builders read) and `ProposalsTelemetryEvent` |

## Where each event is emitted

`ProposalsService` takes an optional `telemetry` reporter (built in `start()` from `core.analytics`) and reports after each write resolves. Building the payload runs inside the same never-throw guard as reporting it.

| Event | Emitted by | When |
|---|---|---|
| `proposals_proposal_created` | `create()` | After the proposal is indexed |
| `proposals_proposal_decided` | `update()` | The write that first records a decision |
| `proposals_proposal_status_changed` | `update()` | The loaded status differs from the written one. A same-status rewrite (the failure handler writing `failed` onto `failed`) sends nothing |
| `proposals_action_executed` | `update()` | An `executing` proposal moves to `succeeded` or `failed` by the loop's own outcome write |
| `proposals_proposal_retried` | `clone()` | After both the clone and the superseded original are written |
| `proposals_proposal_revised` | `revise()` | After both the revision and the superseded predecessor are written. A revision that loses its race and is retired sends nothing |
| `proposals_proposal_resume_rejected` | `releaseGate()` | A typed refusal: `already_decided`, `settled`, `expired`, `input_changed`, `no_execution` or `not_waiting` |
| `proposals_proposal_resume_rejected` | the `proposals.checkDecidePrivileges` step, through `reportResumeRejected()` | `external_principal` or `unprivileged`, behind the gate |
| `proposals_snapshot` | the `proposals:telemetry_snapshot` task (`../tasks/telemetry_snapshot/`) | Once per UTC day, when telemetry is opted in. See [Daily snapshot](#daily-snapshot) |

One approval can send several events of different types (for example `decided` and `status_changed` from the write that records the approval and starts the action), but never two of the same type for one write.

Semantics decided at the emission points:
- **`decision_source` without a recorded source** reads as `human`. It happens only for a gate parked under an older definition (an autonomy decision never parks) or a direct step call.
- **`failure_source`** is `action` when the loop recorded the failure itself, and `workflow_failure` when a settle path did (the only writes that store `settledBy`).
- **`proposals_action_executed`** is sent only for an outcome the loop recorded. A gate failure settled onto a running action sends its `status_changed` (with `failure_source: workflow_failure`) and no `action_executed`, because the action's own outcome is unknown.
- **`time_to_decision_ms`** is still sent for a late decision, together with `decided_after_deadline: true`.
- **`action_id`** is resolved once, in `create()`, from the action read it already makes for the metadata and input check, and stored as the storage-only `actionId`. `clone()` and `revise()` inherit it with the action, so no later event reads the action again. It is absent when the action could not be read at creation: unknown, rather than a guess.

## Caller fields

Every event except `proposals_snapshot` carries these fields.

| Field | Type | Required | Description |
|---|---|---|---|
| `consumer` | keyword | yes | The plugin that manages the calling workflow (its persisted `managedBy`, for example `alertzero`), or `custom` for an unmanaged workflow, a test run or no calling workflow |
| `managed_caller` | boolean | yes | Whether the calling workflow is a managed workflow that is not a test run |
| `caller_run_id` | keyword | no | The calling run's root execution id, as the engine provides it (for a chain that started before the engine carried one, derived server-side on a best-effort basis). It joins proposals to the caller's own events, for example AlertZero's `run_id` |
| `is_default_space` | boolean | yes | Whether the proposal is in the default space |

The caller is the workflow that invoked the `system-create-proposal` gate, read from its persisted execution rather than from any workflow input. A test run copies the managed identity of the workflow it tests, so a test-run caller reads as `custom` rather than as its manager's own use of proposals.

## Proposal id fields

Every event except `proposals_snapshot` also carries these fields, so a dashboard can follow one proposal from created to decided to executed and group a whole chain of retries and revisions.

| Field | Type | Required | Description |
|---|---|---|---|
| `proposal_id` | keyword | yes | The generated id of the proposal the event is about. A retry or a revision is a new proposal: `proposals_proposal_retried` and `proposals_proposal_revised` carry the new one's id |
| `root_proposal_id` | keyword | yes | The generated id of the first proposal in the chain, which every retry and revision inherits. Equals `proposal_id` for the first proposal, and for a record written before chain roots were stored |

## Vocabularies

- **Duration buckets** are upper-inclusive: `le_1h`, `le_24h`, `le_72h`, `le_7d`, `gt_7d`. The default 72h deadline is `le_72h`.
- **`attempt`** is the clone generation: 1 for the first attempt, plus one for each retry after a failed action. A revision does not increment it.
- **`category`** is `configure`, `investigate`, `respond` or `other`. Absent when the proposal has none.
- **`action_id`** is the registered managed workflow definition id an action workflow was installed from, or `custom` for any workflow no plugin manages. It is never a customer-chosen workflow id.

## Events

### `proposals_proposal_created`

A proposal was created.

| Field | Type | Required | Description |
|---|---|---|---|
| caller fields | | | See above |
| proposal id fields | | | See above |
| `action_id` | keyword | no | The action workflow's managed definition id, or `custom` (see Vocabularies). Absent without an action, or when the action could not be read |
| `expires_in_bucket` | keyword | yes | Decision window from creation to the deadline, as a duration bucket, or `none` without a deadline |
| `auto_approve_requested` | boolean | yes | Whether the caller asked the gate to auto-approve. An `always-gate` action still forces a human decision |
| `has_action` | boolean | yes | Whether approval runs an action workflow |
| `category` | keyword | no | The action category (see Vocabularies) |
| `impact_class` | keyword | yes | `low`, `medium`, `high` or `critical` |
| `confidence_bucket` | keyword | yes | `low`, `medium` or `high` |

### `proposals_proposal_decided`

A decision was first recorded on a proposal.

| Field | Type | Required | Description |
|---|---|---|---|
| caller fields | | | See above |
| proposal id fields | | | See above |
| `decision` | keyword | yes | `approved` or `dismissed` |
| `decision_source` | keyword | yes | `human`, or `autonomy` when the caller's autonomy policy auto-approved the gate |
| `decided_after_deadline` | boolean | yes | Whether the decision landed after the deadline. The generic resume API accepts a decision between the deadline and the expiry task firing |
| `attempt` | long | yes | See Vocabularies |
| `dismiss_reason` | keyword | no | The dismiss reason enum (`wrong`, `duplicate`, `insufficient_evidence`, `low_value`, `out_of_scope`, `already_handled`, `other`); dismissals only |
| `time_to_decision_ms` | long | no | Milliseconds from the chain root's creation to the decision; human decisions only |

### `proposals_proposal_status_changed`

A proposal's status really changed. A same-status rewrite sends nothing, and a move to `superseded` is reported as `proposals_proposal_revised` or `proposals_proposal_retried` instead.

| Field | Type | Required | Description |
|---|---|---|---|
| caller fields | | | See above |
| proposal id fields | | | See above |
| `from_status` | keyword | yes | `pending`, `executing`, `succeeded`, `failed`, `expired`, `no_action` or `superseded` |
| `to_status` | keyword | yes | Same vocabulary, never `superseded` |
| `expiry_reason` | keyword | no | `deadline`, `iteration_limit` or `workflow_failure`; only when `to_status` is `expired` |
| `failure_source` | keyword | no | `action` or `workflow_failure`; only when `to_status` is `failed` |

### `proposals_action_executed`

An approved proposal's action finished.

| Field | Type | Required | Description |
|---|---|---|---|
| caller fields | | | See above |
| proposal id fields | | | See above |
| `action_id` | keyword | no | As on `proposals_proposal_created`, stored at creation |
| `outcome` | keyword | yes | `succeeded` or `failed` |
| `attempt` | long | yes | See Vocabularies |
| `category` | keyword | no | The action category |
| `execution_duration_ms` | long | no | Milliseconds from the approval to the outcome |

### `proposals_proposal_revised`

An analyst revised a pending proposal. Sent only after both the new revision and the superseded predecessor are written.

| Field | Type | Required | Description |
|---|---|---|---|
| caller fields | | | See above |
| proposal id fields | | | See above |
| `revision` | long | yes | The new revision's 1-based position in its chain |
| `comment_changed` | boolean | yes | Whether the explanation was replaced |
| `action_input_changed` | boolean | yes | Whether the action input was overridden |
| `impact_changed` | boolean | yes | Whether the impact changed |
| `confidence_changed` | boolean | yes | Whether the confidence changed |

### `proposals_proposal_retried`

A proposal whose action failed was re-offered as a clone. Sent only after both writes.

| Field | Type | Required | Description |
|---|---|---|---|
| caller fields | | | See above |
| proposal id fields | | | See above |
| `attempt` | long | yes | The new attempt the retry re-offers |

### `proposals_proposal_resume_rejected`

A decision attempt was refused. One event per attempt.

| Field | Type | Required | Description |
|---|---|---|---|
| caller fields | | | See above |
| proposal id fields | | | See above |
| `reason` | keyword | yes | `expired`, `already_decided`, `settled`, `input_changed`, `not_waiting`, `no_execution`, `unprivileged` or `external_principal` |

### `proposals_snapshot`

One cluster-level aggregate per UTC day, counting **chain heads** only, so a chain of retries and revisions counts once. It carries no caller fields and no proposal or action id.

| Field | Type | Required | Description |
|---|---|---|---|
| `snapshot_day` | keyword | yes | The UTC day (`YYYY-MM-DD`); dedupe on it |
| `space_count` | long | yes | Spaces with at least one proposal |
| `pending_by_age` | array | yes | `{ age_bucket, count }`: still `pending`, by time since the chain root's creation |
| `pending_overdue_by_age` | array | yes | `{ age_bucket, count }`: still `pending` past the deadline, by overdue time. Cancelled gates and missed wake-ups show here |
| `executing_by_age` | array | yes | `{ age_bucket, count }`: still `executing`, by time since approval. A restart mid-action strands proposals here |
| `settled` | array | yes | `{ status, reason?, count }`: settled heads (all time), by `succeeded`, `failed`, `expired` or `no_action`, with the expiry reason or failure source when recorded |

## Daily snapshot

The `proposals:telemetry_snapshot` Task Manager task reports `proposals_snapshot`. It is registered in `setup()` and scheduled in `start()` with a stable id and a `24h` interval (the scheduling call's rejection is caught and logged). Task Manager and telemetry are both optional plugins: without Task Manager there is no task, and without telemetry every run counts as opted out.

- **Task settings:** `timeout: '5m'`, `cost: Normal`, `priority: Maintenance`, and a versioned state schema holding only `lastSnapshotDay`.
- **Opt-in first.** Each run reads `telemetry.isOptedIn$` before any Elasticsearch work. A missing telemetry plugin, an opt-in that is still undecided after 5s, or a stream error all count as opted out, and the run does nothing.
- **Once per UTC day.** A run whose day equals `lastSnapshotDay` does nothing, so a catch-up run after downtime or a second Kibana node claiming the task cannot report the day twice. The day is recorded only once the event is reported. Consumers can still dedupe on `snapshot_day`.
- **One search, no documents.** A single `size: 0` search runs as the internal user over `.kibana-proposals` in every space, with the run's abort signal. It is a raw client search rather than the storage client's, because the storage client's reads first check the index mappings with calls that cannot carry the signal. A missing index gives an empty snapshot (`space_count: 0`, empty arrays), not an error.
- **Chain heads only.** A head is a proposal with no `supersededBy` and a status other than `superseded`. A retried original keeps its `failed` status but gains `supersededBy`, so it does not count.
- **Ages.** `pending` is aged from the chain root's `createdAt` (a retry or revision inherits it), `pending` past its deadline (`expiresAt` at or before the run time) from `expiresAt`, and `executing` from `decidedAt` (the approval). The buckets have the same upper-inclusive boundaries as every other duration bucket (`le_1h` through `gt_7d`); empty buckets are left out.
- **Settled reasons** come from the head's stored `settledBy`, as the per-write events do: `expired` carries its expiry reason (none when the gate settled under an older definition), and `failed` is `action` without a `settledBy` and `workflow_failure` with one. `succeeded` and `no_action` carry no reason.
- **`space_count`** is a `cardinality` aggregation over the heads' `spaceId`, near-exact below 3,000 spaces. Space ids never leave the search.
- **Failures.** A run never throws. A failed search is logged as a warning and the day is skipped: a recurring task simply runs again at the next interval. An aborted run (the 5m timeout, or shutdown) is logged at debug level and reports nothing.
- **Disabled plugin.** With `xpack.proposals.enabled: false` core never loads the plugin, so the task type is not registered. A task document scheduled earlier is then never claimed.

## Known gaps

- Counts are lower bounds: EBT drops events on a full queue, a send failure or a crash.
- A gate that is cancelled or stranded by a restart sends no settle event; the snapshot's age buckets are how it becomes visible.
- A snapshot run that fails, times out or finds telemetry undecided sends nothing for that day, so a day can be missing from the series.
- An unprivileged decision through the HTTP API is refused before the handler runs, so it sends no `resume_rejected`.
- A refused resume can be reported twice when Kibana restarts within moments of it and the gate step re-runs.
- A refusal that is not typed (a missing proposal, a lost annotation race, or the resume API failing) sends no `resume_rejected`.
- `caller_run_id` is the engine-provided root execution id. Only for a chain that started before the engine carried one is it derived by walking the persisted parents, and then it is absent when the calling chain cannot be read.
- `action_id` is absent on proposals created before it was stored, and on those whose action workflow could not be read at creation.
- A retry of a record written before chain roots were stored inherits no root, so it reports its own id as `root_proposal_id`.
