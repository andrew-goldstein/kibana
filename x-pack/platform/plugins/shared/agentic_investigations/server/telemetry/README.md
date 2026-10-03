# Agentic investigations telemetry

Event-Based Telemetry (EBT) events registered by the `agenticInvestigations` plugin. They go through core analytics (`core.analytics`), so opted-out clusters send nothing. The events are registered once in `setup()`, and both services report through a reporter built in `start()`. See the plugin [README](../../README.md).

These events cover the **human path**: what a user does through this plugin's HTTP API (or an in-process caller of its services). Workflow steps that open or close an Investigation write its metadata through Agent Builder directly (for example `ai.conversation.metadata.patch`), bypass `InvestigationStatusService`, and are not reported here. Consumers that also observe Agent Builder conversation lifecycle events should dedupe on `investigation_id`.

## Privacy contract

- **No identities.** No event carries a user name, email, profile uid, role, API key, or anything read from a `KibanaRequest`. The static test in `event_types.test.ts` fails if any file in this directory imports `KibanaRequest` or `ProposalUser`, so audit data stays out by construction. Collaborators and assignees ship only as a distinct count.
- **No free text.** Every field is a closed enum, a bounded count, a boolean, a duration, or a system-generated id. No field carries a title, summary, description, verdict, rationale or comment. `close_reason` ships only when the stored value is in the template's SELECT vocabulary. No field uses the `text` type.
- **No space ids.** Events carry `is_default_space` instead.
- **System ids ship raw.** `investigation_id` and `escalation_id` are generated Agent Builder conversation UUIDs.
- **Closed schemas.** No field is `pass_through`. In dev mode, a payload with an undeclared key throws, and the schema tests check this.
- **Never throw.** Every emission goes through `reportTelemetryEvents` and `safeReportEvent`, which catch everything and log at debug level, so telemetry cannot fail the write it follows. Services report after their write resolves, outside every optimistic-concurrency attempt, and only on a real transition: a write whose `changedFields` does not include the field emits nothing.

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
| `safe_report_event.ts` | `safeReportEvent` and `createAgenticInvestigationsTelemetryReporter`, the never-throw reporters |
| `report_telemetry_events.ts` | `reportTelemetryEvents`, which builds and reports a write's events without throwing |
| `build_*.ts` | Pure builders that turn a completed write into its events |

## Investigation events

Reported by `InvestigationStatusService.setStatus` after its status write.

### `agentic_investigations_investigation_opened`

An Investigation that had no stored status was opened. This is rare: Investigations are created with `status: open`.

| Field | Type | Required | Description |
|---|---|---|---|
| `investigation_id` | keyword | yes | Investigation (conversation) id |
| `is_default_space` | boolean | yes | Whether the Investigation is in the default space |

### `agentic_investigations_investigation_closed`

An Investigation was closed, directly or by the close of a linked escalation. A cascade close sends one event per Investigation it actually closed; an Investigation whose close failed sends nothing.

| Field | Type | Required | Description |
|---|---|---|---|
| `investigation_id` | keyword | yes | Investigation (conversation) id |
| `is_default_space` | boolean | yes | Whether the Investigation is in the default space |
| `closed_by_class` | keyword | yes | `user` (a direct close) or `escalation_cascade` (the close of a linked escalation) |
| `close_reason` | keyword | no | The stored template close reason: `false_positive`, `benign`, `resolved`, `duplicate` or `other`. The status route does not write it, so it is usually absent on this path |
| `dismiss_reason` | keyword | no | The reason applied to the pending proposals the close dismissed (the proposals `dismissReason` enum). Absent when none was pending |
| `proposals_open_at_close` | long | yes | Proposals still pending when the close was requested. The close dismisses them first. 0 without the proposals plugin |
| `time_open_ms` | long | no | Milliseconds from the Investigation's creation to this close. Not reset by a reopen |

### `agentic_investigations_investigation_reopened`

A closed Investigation was reopened.

| Field | Type | Required | Description |
|---|---|---|---|
| `investigation_id` | keyword | yes | Investigation (conversation) id |
| `is_default_space` | boolean | yes | Whether the Investigation is in the default space |

## Escalation events

Reported by `EscalationsService` after its writes.

### `agentic_investigations_escalation_created`

An escalation was created from an Investigation.

| Field | Type | Required | Description |
|---|---|---|---|
| `escalation_id` | keyword | yes | Escalation (conversation) id |
| `investigation_id` | keyword | yes | The Investigation it was opened from |
| `is_default_space` | boolean | yes | Whether the escalation is in the default space |
| `access_mode` | keyword | yes | `private` or `public` |
| `participant_count` | long | yes | Distinct users given a role at creation: private collaborators and assignees |
| `linked_investigations_at_create` | long | yes | Investigations linked at creation (always 1 today) |

### `agentic_investigations_escalation_investigation_linked`

An Investigation was linked to an existing escalation. One event per newly linked id; ids that were already linked send nothing.

| Field | Type | Required | Description |
|---|---|---|---|
| `escalation_id` | keyword | yes | Escalation (conversation) id |
| `investigation_id` | keyword | yes | The newly linked Investigation |
| `is_default_space` | boolean | yes | Whether the escalation is in the default space |
| `linked_investigation_count` | long | yes | Investigations linked to the escalation after the write |

### `agentic_investigations_escalation_closed`

An open escalation was closed. It is sent only once every linked Investigation closed; an incomplete cascade leaves the escalation open and sends only the Investigation closes that succeeded.

| Field | Type | Required | Description |
|---|---|---|---|
| `escalation_id` | keyword | yes | Escalation (conversation) id |
| `is_default_space` | boolean | yes | Whether the escalation is in the default space |
| `investigations_closed` | long | yes | Linked Investigations this close closed, each also reported as an `escalation_cascade` close |
| `linked_investigation_count` | long | yes | Investigations linked to the escalation when it closed |
| `time_open_ms` | long | no | Milliseconds from the escalation's creation to this close |

## Known gaps

- Opens and closes made by workflows are not reported here (see above).
- There is no `proposals_total` or `verdict_class` on the close event: the first needs an extra proposals query on the close path, and the only verdict is free text.
- Reopening an escalation sends nothing.
