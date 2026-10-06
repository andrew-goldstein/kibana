# Agentic investigations telemetry

Event-Based Telemetry (EBT) events registered by the `agenticInvestigations` plugin. They go through core analytics (`core.analytics`), so opted-out clusters send nothing. The events are registered once in `setup()`, and both services report through a reporter built in `start()`. See the plugin [README](../../README.md).

Every event covers **only changes made through the Agentic Investigations API**: this plugin's HTTP routes or an in-process caller of its services. That includes two kinds of workflow write:
- the one workflow step this plugin owns, `investigations.reopen`, which goes through `InvestigationStatusService` (`reopened_by_class: workflow_step`);
- a workflow's `kibana.request` step calling the status route, such as a managed workflow that closes an Investigation once its proposals settle (`closed_by_class` or `reopened_by_class: workflow_request`).

Writers that change an Investigation's metadata through Agent Builder directly bypass this plugin and send nothing here. By the `source` Agent Builder reports for them:
- `workflow`: workflow steps that patch conversation metadata, such as `ai.conversation.metadata.patch`;
- `execution`: an agent setting metadata with its own `set_conversation_metadata` tool;
- `http_api`: Agent Builder's own conversation metadata route;
- `server_api`: other plugins writing through Agent Builder's server API, for example a solution's own reopen of an Investigation it finds closed.

Agent Builder's `agent_builder_conversation_fields_changed` counts all of them (see [Relation to Agent Builder events](#relation-to-agent-builder-events)). An id derived from a record shared across clusters can repeat on different clusters, so join and count within a cluster.

## Relation to Agent Builder events

Agent Builder's `agent_builder_conversation_fields_changed` ([#297578](https://github.com/elastic/kibana/pull/297578)) is the full count of Investigation and Escalation closes and reopens: the Investigation and Escalation templates opt `status` and `close_reason` in, so every write that changes either sends one event, whoever wrote it, with the close reason paired with the close. It doesn't say who made the change or which space it was in. It also fires `change_kind: created` for every Investigation and Escalation create, because the templates seed `status`; count Escalation creations from `_escalation_created` when you need its access mode or participants, and from Agent Builder's event when you need every writer.

These events cover only the writes made through this plugin, and add what Agent Builder's can't: how the close or reopen was made (`closed_by_class`, `reopened_by_class`) and, for a workflow, which run made it (`workflow_execution_id`), how long the Investigation was open, the proposals pending at close and how many the close dismissed, the reason they were dismissed with, `is_default_space`, and the Escalation lifecycle (creation, links, and the Investigations a close cascaded to). They don't repeat the close reason.

- Join on `investigation_id` or `escalation_id` = `conversation_id`, within a cluster. Nothing shared identifies the write, so a close here matches Agent Builder's close of the same conversation by time.
- Agent Builder reports this plugin's writes with `source: server_api`, including those that came through its HTTP routes and its `investigations.reopen` step, because the plugin writes through Agent Builder's server API. Every plugin that writes through that API shares `server_api`, so it can't be used to pick out this plugin's writes or to dedupe.
- **Telling solutions apart.** Every solution's Investigations use the same `investigation` template, so `template_id` doesn't separate them. To split these events by solution, join on `conversation_id` to `agent_builder_round_complete` and use its `agent_id`: each solution's investigation agent has its own id (a custom agent's id ships as a stable hash).

## Privacy contract

- **No identities.** No event carries a user name, email, profile uid, role, API key, or credential. The only things derived from the request are whether its space is the default one and, for a workflow's `kibana.request`, the calling run's id (sent only when it is a UUID). The static test in `event_types.test.ts` fails if any file in this directory imports `KibanaRequest` or `ProposalUser`, so the builders can't reach audit data; the services and routes that call them read the request. Collaborators and assignees ship only as a distinct count.
- **No free text.** Every field is a closed enum, a bounded count, a boolean, a duration, or a system id. No field carries a title, summary, description, verdict, rationale or comment, and no event reads the Investigation's metadata to build its payload. No field uses the `text` type.
- **No space ids.** Events carry `is_default_space` instead.
- **System ids ship raw.** `investigation_id` is the Investigation's Agent Builder conversation id, and `escalation_id` is the escalation's. Agent Builder generates a random UUID for a conversation created without an id, which is how this plugin creates escalations. A caller creating a conversation may instead supply its own id, including a deterministic one derived from one of its own record ids, so treat `investigation_id` as a stable id that can name a customer record (never a person). Agent Builder's HTTP API requires a supplied id to be a UUID; its server-side client doesn't check, so this relies on in-process callers supplying UUIDs. The same value already ships raw as Agent Builder's `conversation_id`. `workflow_execution_id` is a random UUID the Workflows engine generates, and the engine's own events already ship it.
- **Closed schemas.** No field is `pass_through`. In dev mode, a payload with an undeclared key throws, and the schema tests check this. Production doesn't validate payloads, so a test also checks that every builder emits only keys its schema declares.
- **Never throw.** Every emission goes through `reportTelemetryEvents` and `safeReportEvent`, which catch everything and log at debug level, so telemetry cannot fail the write it follows. Services report after their write resolves, outside every optimistic-concurrency attempt, and only on a real transition: a write whose `changedFields` does not include the field emits nothing.

**What a join reaches.** The contract above holds only within this plugin's own events. `investigation_id` and `escalation_id` are Agent Builder conversation ids, so they join to Agent Builder's events on `conversation_id`: `agent_builder_round_complete` (the model, token counts and message lengths), the tool call events, `agent_builder_round_error`, whose `error_message` is free text truncated to 500 characters, and `agent_builder_conversation_fields_changed` (the template field changes, including the close reason). A round started by a workflow's `ai.agent` step also carries that run's `workflow_execution_id` ([#297574](https://github.com/elastic/kibana/pull/297574)). This plugin's `workflow_execution_id` joins to the Workflows engine's run events for the run that made the change, and through their `executionChain` to the runs that started it; a failed run's event carries its free-text `errorMessage`. "No space ids" and "no free text" describe these events, not everything a join can reach.

The schema tests (`event_types.test.ts`) enforce the following:
- every field has a description, and every event carries `is_default_space`;
- no field is `text` or `pass_through`;
- no field name is in the denylist (`user`, `username`, `email`, `name`, `title`, `summary`, `description`, `verdict`, `message`, `rationale`, `comment`, `assignees`, `collaborators`, `space_id`, `spaceId`);
- this README documents exactly the registered events.

## Module

| File | Contents |
|---|---|
| `constants.ts` | `AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX`, the `AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS` name map, and the closed vocabularies |
| `event_types.ts` | One `EventTypeOpts` and one payload type per event, plus `AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES` |
| `register_telemetry_events.ts` | `registerAgenticInvestigationsTelemetryEvents(analytics)`, called once in `setup()` |
| `safe_report_event.ts` | `safeReportEvent` and `createAgenticInvestigationsTelemetryReporter`, the never-throw reporters, which return whether the event was reported |
| `report_telemetry_events.ts` | `reportTelemetryEvents`, which builds and reports a write's events without throwing |
| `build_*.ts` | Pure builders that turn a completed write into its events |

The status route labels a workflow's `kibana.request` call with `getWorkflowRequestExecutionId` (`../investigations/helpers/get_workflow_request_execution_id`): the request must carry both the internal-origin header and the Workflows engine's `x-kibana-workflow-execution-id`, which `kibana.request` always sends. Any caller can set those headers, so the label is best effort and is never used for authorization.

## Investigation events

Reported by `InvestigationStatusService.setStatus` after its status write, so only for status changes made through the Agentic Investigations API.

### `agentic_investigations_investigation_closed`

An Investigation was closed through the Agentic Investigations API: directly, by a workflow calling the status route, or by the close of a linked escalation. A cascade close sends one event per Investigation whose own write changed its status; an Investigation whose close failed, or that another writer closed in the meantime, sends nothing.

| Field | Type | Required | Description |
|---|---|---|---|
| `investigation_id` | keyword | yes | Investigation (conversation) id |
| `is_default_space` | boolean | yes | Whether the Investigation is in the default space |
| `closed_by_class` | keyword | yes | `direct` (a close requested through this plugin's status API or service by anything other than a workflow: a person in the UI, an API key or other automation), `escalation_cascade` (the close of a linked escalation) or `workflow_request` (a workflow's `kibana.request` step calling the status route) |
| `dismiss_reason` | keyword | no | The reason applied to the pending proposals the close dismissed (the proposals `dismissReason` enum). Absent when the close dismissed no proposal |
| `proposals_open_at_close` | long | yes | Proposals still pending when this close attempt was requested. 0 without the proposals plugin. The close tries to dismiss each, but skips one that was decided, or whose gate ended, in the meantime. Counted per attempt: when a close is retried after a `ProposalDismissFailedError`, the retry counts only the proposals that remain |
| `proposals_dismissed_at_close` | long | yes | Pending proposals this close attempt dismissed; at most `proposals_open_at_close` |
| `time_open_ms` | long | no | Milliseconds from the conversation's creation to this close. Not reset by a reopen, so after a reopen it is the Investigation's age |
| `workflow_execution_id` | keyword | no | The workflow run that made the close, for `workflow_request`, when its id is a UUID |

### `agentic_investigations_investigation_reopened`

A closed Investigation was reopened through the Agentic Investigations status service: directly, by any workflow running the `investigations.reopen` step (for example one that reopens a closed Investigation before it creates a proposal for it), or by a workflow calling the status route.

| Field | Type | Required | Description |
|---|---|---|---|
| `investigation_id` | keyword | yes | Investigation (conversation) id |
| `is_default_space` | boolean | yes | Whether the Investigation is in the default space |
| `reopened_by_class` | keyword | yes | `direct` (a reopen requested through this plugin's status API or service by anything other than a workflow), `workflow_step` (any workflow running the `investigations.reopen` step, including custom workflows and test runs) or `workflow_request` (a workflow's `kibana.request` step calling the status route). Workflows that reopen any other way send nothing here |
| `workflow_execution_id` | keyword | no | The workflow run that made the reopen, for `workflow_step` and `workflow_request`. Joins to the Workflows engine's run events, and through their `executionChain` to the runs that started it |

## Escalation events

Reported by `EscalationsService` after its writes, so only for escalation changes made through the Agentic Investigations API. When escalations are turned off (`xpack.agenticInvestigations.escalations.enabled: false`, as in Observability serverless), the service is never built and these three events never fire.

### `agentic_investigations_escalation_created`

An escalation was created from an Investigation through the Agentic Investigations API.

| Field | Type | Required | Description |
|---|---|---|---|
| `escalation_id` | keyword | yes | Escalation (conversation) id |
| `investigation_id` | keyword | yes | The Investigation it was opened from |
| `is_default_space` | boolean | yes | Whether the escalation is in the default space |
| `access_mode` | keyword | yes | `private` or `public` |
| `participant_count` | long | yes | Distinct users assigned at creation (at least one). A private escalation grants access to exactly these users |
| `linked_investigations_at_create` | long | yes | Investigations linked at creation (always 1 today) |

### `agentic_investigations_escalation_investigation_linked`

An Investigation was linked to an existing escalation through the Agentic Investigations API. One event per newly linked id; ids that were already linked send nothing.

| Field | Type | Required | Description |
|---|---|---|---|
| `escalation_id` | keyword | yes | Escalation (conversation) id |
| `investigation_id` | keyword | yes | The newly linked Investigation |
| `is_default_space` | boolean | yes | Whether the escalation is in the default space |
| `linked_investigation_count` | long | yes | Investigations linked to the escalation after the write |

### `agentic_investigations_escalation_closed`

An open escalation was closed through the Agentic Investigations API. It is sent only once every linked Investigation closed; an incomplete cascade leaves the escalation open and sends only the Investigation closes that succeeded.

| Field | Type | Required | Description |
|---|---|---|---|
| `escalation_id` | keyword | yes | Escalation (conversation) id |
| `is_default_space` | boolean | yes | Whether the escalation is in the default space |
| `investigations_closed` | long | yes | Linked Investigations whose close succeeded in this close attempt. Each sends an `escalation_cascade` close only when its own write changed its status, so one another writer closed in the meantime is counted here without one. Counted per attempt: when a close is retried after an `EscalationCloseIncompleteError`, it counts only the Investigations the retry closed |
| `linked_investigation_count` | long | yes | Investigations linked to the escalation when it closed |
| `time_open_ms` | long | no | Milliseconds from the escalation's creation to this close |

## Known gaps

- Closes and reopens written through Agent Builder directly are not reported here (see the writers listed above). `_investigation_closed` therefore counts closes made through this plugin, not every Investigation close; Agent Builder's `agent_builder_conversation_fields_changed` counts them all.
- Closes written through Agent Builder directly carry no `time_open_ms` or proposal counts. Derive time open from Agent Builder's `change_kind: created` and closing events for the same `conversation_id`.
- `workflow_request` is read from request headers any caller can set, so a caller could make a close look like a workflow's. That affects only the label.
- A cascade close carries no `escalation_id`. After an incomplete close is retried, or abandoned, its earlier cascade closes match their escalation only by time.
- There is no `proposals_total` or `verdict_class` on the close event. Proposals per Investigation is a join on the Proposals events (`conversation_id`, deduplicated by `root_proposal_id`); the only verdict is free text.
- Reopening an escalation sends nothing here (Agent Builder's `agent_builder_conversation_fields_changed` reports it), so an escalation closed, reopened and closed again sends `escalation_closed` twice, and `time_open_ms` still counts from creation.
- Two callers linking the same Investigation to an escalation at the same moment can each report it as newly linked.
- A status write that fails after the close dismissed proposals sends nothing; the retry reports `proposals_open_at_close: 0`. A write that lands but whose response is lost sends no close at all.
- `time_open_ms` is omitted when the clocks of the Kibana nodes that created and closed the conversation disagree enough to make it negative.
- These events also fire for Investigations outside AlertZero: the template UI registers wherever Agent Builder runs, and Nightshift depends on this plugin.
