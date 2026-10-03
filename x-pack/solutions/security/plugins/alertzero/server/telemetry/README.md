# AlertZero telemetry

Event-Based Telemetry (EBT) events registered by the `alertzero` plugin. They go through core analytics (`core.analytics`), so opted-out clusters send nothing.

The events are registered in `setup()` inside the `xpack.alertzero.enabled` guard, so with the kill switch off no AlertZero event type exists. See the plugin [README](../../README.md).

Run reliability (started, completed, failed, cancelled, timed out) is not duplicated here. It comes from the Workflows engine's own terminal execution events. Join them to these events through `run_id`, which is the root execution id. AlertZero events cover only what the engine cannot know: domain outcomes (including the Worker's own Investigation closes), settings and daily snapshots.

## Privacy contract

- **No identities.** No event carries a user name, email, role, API key, or anything read from a `KibanaRequest`. The static test in `event_types.test.ts` fails if any file in this directory imports `KibanaRequest` or `ProposalUser`, so audit data stays out by construction. Audit logging is a separate pipeline.
- **No free text.** Every field is a closed enum, a bounded count, a boolean, a day, or a system-generated id. No field carries titles, summaries, descriptions, comments, rationales, verdict text, error messages, alert content or query content. No field uses the `text` type.
- **No space ids.** Events carry `is_default_space` instead. This holds only within AlertZero's own events (see "What a join reaches" below).
- **System ids ship raw.** `run_id` and `execution_id` are generated UUIDs, which the engine already ships. `investigation_id` is the Investigation's Agent Builder conversation id. For an Attack Discovery Worker Investigation it is neither random nor a one-way hash: the review's `resolve_investigation_id` step (`attack_discovery_review.yaml`) takes the first 120 bits (30 hex characters) of `attack_discovery_id`, which is the attack's `kibana.alert.uuid` (a SHA-256 hex), and sets the UUID version and variant characters to `8`. So it is a stable id for a customer record (the attack), the same for every review of that attack. It names no person and carries no alert content, and the same value already ships raw as Agent Builder `conversation_id`. Workflow ids ship only as a Worker catalog id; anything else is `other`.
- **Snapshots are cluster-level aggregates.** They are summed across spaces and carry `space_count`, never a per-space breakdown.
- **Closed schemas.** No field is `pass_through`. In dev mode, a payload with an undeclared key throws, and the schema tests check this.
- **Never throw.** Every emission goes through `safeReportEvent`, which catches everything and logs at debug level. Emitters report after their write resolves, never inside an optimistic-concurrency callback, and only on a real transition.

### What a join reaches

The ids above add no content of their own, but they join to events other plugins already ship. `run_id` and `execution_id` join to the Workflows engine's own execution events (`workflows_execution_workflow_completed`, `_failed` and `_cancelled`) through `workflowExecutionId`, and those carry the raw `spaceId`, the `workflowId` (for a custom workflow, usually built from the workflow's name), `ruleId` on an alert-triggered run, and the free-text `errorMessage` and `cancellationReason`. `investigation_id` joins to the Agent Builder events on `conversation_id`, including `agent_builder_round_error`, whose `error_message` is truncated to 500 characters. So "no space ids" and "no free text" hold only within AlertZero's own events, not across a join. To keep AlertZero's own text out of that join, a `workflow.fail` message in an AlertZero managed workflow interpolates only definition constants, `| size` counts and a few named numbers (the close-alerts action's counts, which analysts also see as the proposal's error), and `managed/definitions/alertzero/fail_messages.test.ts` enforces it. The three response actions (`actions/defend/`) belong to @elastic/security-defend-workflows and are fixed in that team's own change.

The schema tests (`event_types.test.ts`) enforce the following:
- every field has a description;
- no field is `text` or `pass_through`;
- no field name is in the denylist (`user`, `username`, `email`, `name`, `title`, `message`, `rationale`, `comment`, `description`, `space_id`, `spaceId`, `decidedBy`, `executionError`, `actionInput`);
- this README documents exactly the registered events.

## Module

| File | Contents |
|---|---|
| `constants.ts` | `ALERTZERO_TELEMETRY_PREFIX`, the `ALERTZERO_TELEMETRY_EVENTS` name map, and the closed vocabularies |
| `event_types.ts` | One `EventTypeOpts` and one payload type per event, plus `ALERTZERO_TELEMETRY_EVENT_TYPES` |
| `register_telemetry_events.ts` | `registerAlertZeroTelemetryEvents(analytics)`, called once in `setup()` |
| `safe_report_event.ts` | `safeReportEvent` and `createAlertZeroTelemetryReporter`, the never-throw reporters; both return whether the event was reported |
| `envelope/` | `buildAlertZeroEnvelope` and its resolvers |
| `worker_settings/` | `buildWorkerSettingsChangedPayloads`, `buildWorkerActivatedPayload`, `bucketScheduleInterval` and `resolveWorkerSetting`, used by `WorkersService` |
| `snapshot/` | `buildAutonomySnapshotPayload`, `buildFeatureFlagsSnapshotPayload`, `toSnapshotDay` and the `SNAPSHOT_FLAGS` allowlist, used by the snapshot task |
| `../tasks/telemetry_snapshot/` | The daily `alertzero:telemetry_snapshot` Task Manager task that reads every space and reports the two snapshots |
| `../../common/telemetry/constants.ts` | The Attack Discovery outcome vocabularies and the Investigation close reasons, which the report step's input schema shares |

## The envelope

Every Worker run event (the `alertzero_ad_worker_*` events) carries these fields. `buildAlertZeroEnvelope({ executionId, root })` builds them from the run's **root execution**, the persisted `WorkflowExecutionDto` of the Worker that started the chain. It reads nothing from workflow inputs or the step context.

| Field | Type | Required | Source |
|---|---|---|---|
| `worker_id` | keyword | yes | The root's `originManagedWorkflowId` if it is in the Worker catalog (`SYSTEM_SECURITY_WORKER_CATALOG`), else `other` |
| `watch_tag` | keyword | yes | The catalog entry's `watchTag`, else `other` |
| `autonomy_level` | keyword | no | The root's persisted `workflowDefinition.consts.worker_settings.autonomy` (`manual`, `assisted` or `supervised`). This is never the installed Worker's current settings: a review can park for 72h while the settings change. Absent when the root carries no recognised level |
| `autonomy_mode` | keyword | no | Derived: `auto_accept` for `supervised` (the review gate auto-approves), `gated` for `manual` and `assisted`. Absent with `autonomy_level` |
| `run_id` | keyword | yes | The root execution id. Every event of one Worker run shares it |
| `execution_id` | keyword | yes | The execution that reported the event: the root or a descendant (for example a review) |
| `is_default_space` | boolean | yes | Whether the root's `spaceId` is the default space |
| `trigger_type` | keyword | yes | The root's persisted `triggeredBy`: `manual`, `scheduled`, `alert` or `workflow_step` for the built-in sources; `event` for a registered trigger id with the engine's dispatch evidence; `other` for any other provenance string; `unknown` when it is missing. `workflow_step` is the engine's `workflow-step` (its `triggerType` value), spelled with an underscore; the other built-in values and `event` match the engine's |

Launch-gate metrics should select `trigger_type: scheduled` (or `event` for pollers). A manual run of a managed Worker can be steered with inputs.

## Worker run events (Attack Discovery)

The `alertzero.reportWorkerOutcome` workflow step emits these events from the Attack Discovery Worker YAML. Report steps use `on-failure: continue`, so the counts are lower bounds.

The step reports only for a managed AlertZero Worker run. It skips a test run, a workflow AlertZero does not manage, and any chain whose persisted ancestors are not all non-test AlertZero executions in the same space up to a catalog Worker root. Its input is a closed union of enums, bounded counts and flags, and its output is `{ reported }` alone. The caller check is best-effort. See the [step README](../step_types/report_worker_outcome/README.md).

Semantics to keep in mind:
- Review events can arrive before `run_completed`.
- A missing `run_completed` means that the runner was cancelled, failed or timed out. Read the root's engine event.
- Skipped reviews send nothing, so `attacks_persisted` ≥ the number of `review_started` events.

### `alertzero_ad_worker_run_completed`

Emitted by the runner once every review has been dispatched.

| Field | Type | Required | Description |
|---|---|---|---|
| envelope | | | See above |
| `run_outcome` | keyword | yes | `produced`, `empty_no_alerts`, `empty_no_attacks`, `empty_all_duplicates`, `degraded_partial` or `failed_all_batches`. When every batch fails, the run still completes; this marks it |
| `alerts_analyzed` | long | yes | Alerts sent to generation |
| `batches_total` | long | yes | Generation batches attempted |
| `batches_failed` | long | yes | Generation batches that failed |
| `attacks_generated` | long | yes | Attacks the model generated, before deduplication |
| `attacks_persisted` | long | yes | Attacks persisted and dispatched for review |

The runner derives `run_outcome` from its own counts, first match wins:

1. `empty_no_alerts`: no generation batch, because no alert was retrieved.
2. `failed_all_batches`: every batch failed.
3. `degraded_partial`: some batches failed, whether or not attacks persisted.
4. `produced`: at least one attack persisted.
5. `empty_all_duplicates`: attacks were generated, but every one already existed.
6. `empty_no_attacks`: nothing was generated.

There is no `skipped_space_disabled` outcome: a space with AlertZero off never launches the runner.

### `alertzero_ad_worker_review_started`

Emitted by a review once its Investigation exists.

| Field | Type | Required | Description |
|---|---|---|---|
| envelope | | | See above |
| `investigation_id` | keyword | no | The Investigation the review opened or reused. It joins Investigation events to the run |
| `is_rereview` | boolean | no | Whether the attack already had an Investigation |

### `alertzero_ad_worker_analysis_completed`

Emitted by a review after the FP/TP verdict is recorded.

| Field | Type | Required | Description |
|---|---|---|---|
| envelope | | | See above |
| `verdict` | keyword | yes | `true_positive`, `false_positive`, `inconclusive` or `failed`. Timeouts are `failed`, never `inconclusive` |
| `analysis_error` | boolean | yes | Whether the analysis failed or timed out. Liquid cannot tell a timeout apart from other failures |

### `alertzero_ad_worker_handoff_resolved`

Emitted by a review after a **completed** escalation gate. For a gate that failed or was cancelled, use the proposals events (`caller_run_id`).

| Field | Type | Required | Description |
|---|---|---|---|
| envelope | | | See above |
| `outcome` | keyword | yes | `approved` (approved, and the handoff action succeeded), `dismissed`, `expired` (nobody decided) or `approved_action_failed` (approved, but the handoff action did not succeed) |
| `verdict` | keyword | no | The verdict that led to the escalation (`true_positive` or `inconclusive`) |
| `auto_approve_requested` | boolean | no | Whether the review asked the gate to auto-approve |

### `alertzero_ad_worker_investigation_closed`

Emitted by a review after it closes its own Investigation: on a false-positive verdict (`report_investigation_closed_false_positive`, `close_reason: false_positive`), and when the analyst declines the escalation (`report_investigation_closed_declined`, `close_reason: other`). Each close continues on failure, so each report runs only when its close left no error. Each report also needs its close to have changed the Investigation's `status`, so a review that finds its Investigation already closed by a human (for example, a human close that dismissed the review's pending gate) sends nothing: that close is reported once, as `agentic_investigations_investigation_closed`. `alertzero_ad_worker_review_started` already covers the open.

| Field | Type | Required | Description |
|---|---|---|---|
| envelope | | | See above |
| `investigation_id` | keyword | yes | The Investigation the review closed. It joins to `alertzero_ad_worker_review_started` |
| `close_reason` | keyword | yes | The Investigation template's close reason the review wrote: `false_positive`, `benign`, `resolved`, `duplicate` or `other` |

Only the review's own closes are measured. A close by an Agent Builder agent (`set_conversation_metadata`), a custom workflow, a direct Agent Builder API call, or another review Worker sends nothing here. A human close through Agentic Investigations reports its own `agentic_investigations_investigation_closed`.

## Worker settings events

`WorkersService.update` emits these events after its write is confirmed. They carry no run envelope. Instead they carry `worker_id`, `watch_tag` and `is_default_space`, with the same rules as the envelope. The helpers that build them live in `worker_settings/`.

A PATCH that is rejected, conflicts on its revision, is invalid, or whose write cannot be confirmed sends nothing. The events are reported only once every write of the PATCH has succeeded, so a PATCH that fails part way (for example, its disable write fails after its settings were saved) sends nothing either.

### `alertzero_worker_settings_changed`

One event per changed setting. The service diffs the stored settings against the confirmed write (`diffWorkerSettings`), so a PATCH that repeats the stored values sends nothing. Defaults that a legacy document gains on save are not a change.

An enable or disable of an installed Worker is reported as the `enabled` setting. The service compares the requested state with the enabled state it read before the write, so enabling an enabled Worker or disabling a disabled one sends nothing. The write that first installs a Worker sends `alertzero_worker_activated` instead, and no `enabled` event, so the install is not counted twice.

| Field | Type | Required | Description |
|---|---|---|---|
| `worker_id` | keyword | yes | Catalog id, else `other` |
| `watch_tag` | keyword | yes | Catalog watch tag, else `other` |
| `is_default_space` | boolean | yes | Whether the Worker is in the default space |
| `setting` | keyword | yes | `autonomy`, `schedule_interval`, `extras`, `enabled` (an enable or disable of an installed Worker) or `other` (any settings key outside this allowlist) |
| `previous_value` | keyword | no | The previous value, for enum, bounded or boolean settings only: the autonomy level, the schedule interval bucket, or `true` or `false` for `enabled`. On a Worker's first save it is the Worker's default. Absent for `extras` and `other` |
| `next_value` | keyword | no | The new value, with the same rules as `previous_value` |
| `settings_revision` | long | no | The settings revision the write was accepted against (the Worker document's version before the write). Absent on a Worker's first save, and on an enable or disable that saves no settings |
| `bulk_write` | boolean | yes | Whether the same write changed more than one setting, counting an enable or disable as one. Each changed setting still gets its own event |

`extras` and `other` values are never sent. The event only records that they changed.

`enabled` values are the strings `true` and `false`, because `previous_value` and `next_value` are keywords. A PATCH that changes the autonomy level and disables the Worker sends two events, `autonomy` then `enabled`, both with `bulk_write: true` and the same `settings_revision`.

A schedule interval is never sent raw. It is reported as one of these half-open buckets: `lt_15m`, `15m_to_lt_1h`, `1h_to_lt_6h`, `6h_to_lt_24h`, `24h_to_lt_7d` or `gte_7d`, and `unknown` for an interval that does not parse. A change inside one bucket (for example `2h` to `3h`) is still reported, with equal previous and next values.

### `alertzero_worker_activated`

Emitted once per Worker and space, by the write that first installs the Worker there. That is a first enable, or a settings save or disable on a Worker with no document yet, which installs it disabled. So "activated" means installed, not turned on: the onboarding page's per-Worker toggles install every Worker they list, including the ones left off, and each of those sends `enabled: false`. A later enable or disable of an installed Worker sends `alertzero_worker_settings_changed` with `setting: enabled` instead. Current enabled state across the cluster comes from `alertzero_autonomy_snapshot`.

| Field | Type | Required | Description |
|---|---|---|---|
| `worker_id` | keyword | yes | Catalog id, else `other` |
| `watch_tag` | keyword | yes | Catalog watch tag, else `other` |
| `is_default_space` | boolean | yes | Whether the Worker is in the default space |
| `enabled` | boolean | yes | Whether the Worker is enabled after the write that installed it |
| `autonomy_level` | keyword | no | The autonomy level the Worker was installed with. Absent when its stored settings cannot be read |

## Daily snapshots

A daily Task Manager task (`alertzero:telemetry_snapshot`, `../tasks/telemetry_snapshot/`) sends one event of each type per day, as a cluster-level aggregate summed across spaces. No event carries a space id, and there is no per-space event.

- **Registration.** The task type is registered in `setup()` inside the `xpack.alertzero.enabled` guard, and scheduled in `start()` with a stable id and a `24h` interval. Task Manager and telemetry are optional plugins: without Task Manager there is no snapshot. With the kill switch off the plugin does not load, so it cannot remove the task; a task document scheduled earlier is never claimed, because its type is not registered.
- **Opt-in first.** Each run reads the telemetry plugin's opt-in decision before any Elasticsearch work, and sends nothing when opted out. No telemetry plugin, or no decision yet, counts as opted out.
- **Once per UTC day.** The task state keeps `lastSnapshotDay`, so a catch-up run after downtime, or a second run on the same day, sends nothing. Consumers can also dedupe on `snapshot_day`.
- **Reads.** The task lists every space from the `space` saved objects (only `default` without the spaces plugin), then reads at most 5 spaces at a time. For each space it reads the two Advanced Settings through an internal saved objects client scoped to that space, and each catalog Worker's installed document through AlertZero's owner-bound managed workflows client, as the Workers API does. None of these reads takes an abort signal, so the run checks it before each space and before reporting.
- **Failures.** A space whose reads fail is left out of both events, and `space_count` counts only the spaces read. A run that fails, is aborted, or can read no space sends nothing and does not record the day. It is logged, and the next scheduled run tries again, so a failure skips a day at most.

### `alertzero_autonomy_snapshot`

| Field | Type | Required | Description |
|---|---|---|---|
| `snapshot_day` | keyword | yes | The UTC day (`YYYY-MM-DD`) the snapshot describes. Used to dedupe catch-up runs |
| `space_count` | long | yes | Number of spaces aggregated |
| `workers` | array | yes | One entry per `worker_id` × `autonomy_level` × `enabled` combination |
| `workers.worker_id` | keyword | yes | Catalog id, else `other` |
| `workers.autonomy_level` | keyword | yes | `manual`, `assisted` or `supervised` |
| `workers.enabled` | boolean | yes | Whether the installed Worker is enabled |
| `workers.count` | long | yes | Number of spaces with that combination |

Only Workers installed in a space are counted: a Worker that was never enabled or saved there has no document. A Worker whose stored settings cannot be parsed is not counted either.

### `alertzero_feature_flags_snapshot`

| Field | Type | Required | Description |
|---|---|---|---|
| `snapshot_day` | keyword | yes | The UTC day (`YYYY-MM-DD`) the snapshot describes |
| `space_count` | long | yes | Number of spaces aggregated |
| `flags` | array | yes | One entry per allowlisted flag |
| `flags.flag` | keyword | yes | An allowlisted flag or advanced setting id: `securitySolution:enableAlertZero`, `securitySolution:enableAttackDiscoveryWorkflows` or `securitySolution.attackDiscoveryWorkflowsEnabled` (see the allowlist below) |
| `flags.enabled_space_count` | long | yes | Number of spaces where it is enabled |

The allowlist, in payload order:

| `flag` | Kind | Enabled when |
|---|---|---|
| `securitySolution:enableAlertZero` | Per-space Advanced Setting | The space's value is `true` |
| `securitySolution:enableAttackDiscoveryWorkflows` | Per-space Advanced Setting (Security Solution) | The space's value is `true`. An unset value, or Security Solution not registering the setting, counts as disabled |
| `securitySolution.attackDiscoveryWorkflowsEnabled` | Deployment-wide feature flag | The flag is on (it defaults to on). It has no per-space value, so its count is `space_count` or `0` |

Attack Discovery Workflows are active in a space only when both of the last two are enabled there.
