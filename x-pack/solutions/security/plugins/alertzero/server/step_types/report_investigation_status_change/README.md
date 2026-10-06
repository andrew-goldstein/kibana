# `alertzero.reportInvestigationStatusChange`

A workflow step that reports an Investigation's status as the `alertzero_investigation_status_changed` EBT event (see the [telemetry README](../../telemetry/README.md#investigation-status-listener)). Its only caller is AlertZero's managed Investigation status listener, `system-alertzero-investigation-status-listener`, which the `ai.conversation.updated` trigger starts. It is registered on the server and in the browser only when `xpack.alertzero.enabled` is on, with the same plugin dependencies as `alertzero.reportWorkerOutcome`.

## Input

| Field | Description |
|---|---|
| `investigation_id` | The event's `conversationId`. Must be a UUID |
| `source` | The event's `source`: `execution`, `http_api`, `workflow` or `server_api` |

Unknown keys fail the parse. The status and the close reason are never inputs: the step reads them from the Investigation.

## Output

`{ reported: boolean }` and nothing else. The step never throws. Still run it with `on-failure: continue` and a short `timeout`.

## What it checks

In order, stopping at the first failure:

1. The input parses. Otherwise `invalid_input`.
2. The run is not aborted (checked again before the Investigation read and before reporting). Otherwise `aborted`.
3. The run is not a test run. Otherwise `test_run`.
4. The run was started by `ai.conversation.updated` (`execution.triggeredBy`). Otherwise `not_conversation_trigger`.
5. The write was not a server-side write, which reports itself. Otherwise `excluded_source`. The writer is `agent` for `execution`, `workflow` for `workflow` and `api` for `http_api`.
6. Telemetry is opted in (the same 1s read as `alertzero.reportWorkerOutcome`). Otherwise `opted_out`. Every check before this one is local, so an opted-out cluster makes no read.
7. AlertZero's owner-bound managed workflows client knows the reporting workflow, in the run's space or the global space. Otherwise `not_managed`, or `lineage_unavailable` when it can't tell.
8. The Investigation, read through Agent Builder's scoped conversation client as the run, without its rounds (5s). Otherwise `read_failed`, or `not_found` when the run can't see it.
9. The conversation uses the `investigation` template, and its status is `open`, `closed` or absent (read as `open`). Otherwise `not_investigation` or `unknown_status`. The close reason is sent only when the Investigation is closed and the reason is one of the template's values.

`is_default_space` comes from the run's space, which for this global workflow is the space of the write.

## Skip reasons

A skip is written to the AlertZero server logger (`plugins.alertzero.telemetry`), never to the workflow event log or the step output.

| Reason | Level |
|---|---|
| `aborted`, `test_run`, `not_conversation_trigger`, `excluded_source`, `opted_out`, `not_managed`, `lineage_unavailable`, `read_failed`, `not_found`, `not_investigation`, `unknown_status` | debug |
| `invalid_input` (issue paths and codes only, never the rendered values), `report_error` | warn |

## Tests

- `report_investigation_status_change_step.test.ts`: the checks, their order, and the payload against a dev-mode analytics client.
- `listener_yaml_contract.test.ts`: the shipped listener's trigger condition, evaluated with `@kbn/eval-kql` the way the engine evaluates it, its concurrency key, and its step input against this schema.
- `map_write_source.test.ts` and `read_investigation_status.test.ts`: the writer and status mappings.
