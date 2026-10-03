# `alertzero.reportWorkerOutcome`

A workflow step that reports an allowlisted AlertZero Worker outcome as an EBT event (see the [telemetry README](../../telemetry/README.md)). It is the only way Worker YAML can emit an outcome. It is registered on the server and in the browser only when `xpack.alertzero.enabled` is on.

## Input

`with` is a closed union keyed by `event`. Each branch accepts only enums, bounded integer counts and booleans; the one id is the review's own `investigation_id`, which must be a UUID. Unknown keys fail the parse.

| `event` | Reports | Fields |
|---|---|---|
| `ad_worker_run_completed` | `alertzero_ad_worker_run_completed` | `alerts_analyzed`, `batches_total`, `batches_failed`, `attacks_generated`, `attacks_persisted` (counts, default `0`), `run_outcome` (required) |
| `ad_worker_review_started` | `alertzero_ad_worker_review_started` | `investigation_id` (UUID, optional), `is_rereview` (optional) |
| `ad_worker_analysis_completed` | `alertzero_ad_worker_analysis_completed` | `verdict` (required), `analysis_error` (default `false`) |
| `ad_worker_handoff_resolved` | `alertzero_ad_worker_handoff_resolved` | `outcome` (required), `verdict` (optional), `auto_approve_requested` (optional) |
| `ad_worker_investigation_closed` | `alertzero_ad_worker_investigation_closed` | `investigation_id` (UUID, required), `close_reason` (required, the Investigation template's close reason) |

Liquid renders a missing value as `''`, so every count and flag treats `''` and `null` as absent, and a count or flag also accepts the text a `{{ }}` template renders (`'12'`, `'true'`). Prefer `${{ }}` typed values with a `default`. The engine does not apply the input schema at runtime, so the handler parses it itself.

## Shipped callers

The Attack Discovery Worker YAML in `@kbn/workflows/managed` (`definitions/alertzero/`) is the only caller. Each report step has `on-failure: continue` and `timeout: 30s`, and is a top-level step, except `report_investigation_closed_false_positive`, which sits in the verdict switch's `false_positive` arm (a switch arm, unlike a `parallel` branch, accepts both).

| Workflow | Step | `event` | Placement |
|---|---|---|---|
| `attack_discovery_runner.yaml` | `report_run_completed` | `ad_worker_run_completed` | After `run_review_batches`, right before `emit_result` |
| `attack_discovery_review.yaml` | `report_review_started` | `ad_worker_review_started` | Right after `verify_investigation` |
| `attack_discovery_review.yaml` | `report_analysis_completed` | `ad_worker_analysis_completed` | Right after `refresh_verdict`, for every verdict |
| `attack_discovery_review.yaml` | `report_investigation_closed_false_positive` | `ad_worker_investigation_closed` | Right after `close_investigation_false_positive` in the `false_positive` arm, only when that close left no error and changed `status` |
| `attack_discovery_review.yaml` | `report_handoff_resolved` | `ad_worker_handoff_resolved` | Right after `record_decision`, only when `resolve_escalation.output.escalate` is true |
| `attack_discovery_review.yaml` | `report_investigation_closed_declined` | `ad_worker_investigation_closed` | Right after `close_investigation_declined`, only when the escalation was declined and that close left no error and changed `status` |

`shipped_yaml_contract.test.ts` renders each of these `with` blocks the way the engine does and validates it against the input schema, so a YAML edit that the schema would reject fails in CI instead of logging `invalid_input` at runtime.

## Output

`{ reported: boolean }` and nothing else. The step never throws, so a telemetry problem never fails a Worker run. Still run it with `on-failure: continue` and a short `timeout`, and never inside a `parallel` branch or a `waitForApproval` branch.

## What it verifies

In order, stopping at the first failure:

1. The input parses. Otherwise `invalid_input`.
2. The run is not aborted (checked again before every Elasticsearch read and immediately before reporting). Otherwise `aborted`.
3. The step's own execution is not a test run. Otherwise `test_run`.
4. Telemetry is opted in (a 1s read of the telemetry plugin's opt-in; no plugin or no decision counts as opted out). Otherwise `opted_out`. Every check before this one is local, so an opted-out cluster makes no Elasticsearch read.
5. AlertZero's owner-bound managed workflows client knows the reporting workflow, in the execution space or else the global space. Otherwise `not_managed`.
6. The persisted ancestors, read through the Workflows management setup API with `omitStepExecutions`, starting at the reporting execution: at most 10 parent hops, 5s per read, every hop in the same space (compared explicitly), not a test run, and managed by `alertzero`. Parents are read from both context shapes (`parentWorkflowExecutionId`, and the `parent.executionId` a terminal save rewrites it to).
7. The root (the hop with no parent) is a catalog Worker (`originManagedWorkflowId` in `SYSTEM_SECURITY_WORKER_IDS`). Otherwise `not_catalog_root`.

A missing or unreadable ancestor, a timeout, a cycle, a chain that is too deep, or a hop in another space is `lineage_unavailable`. The envelope is then built from the verified root, as for every Worker run event.

The caller check is best-effort.

Verified chains are cached for 10 minutes (500 entries). Each execution of a chain maps to the chain's root and answers only in its own space, so the several reports of one review, and sibling reviews of one runner, skip the reads already made.

## Skip reasons

A skip is written to the AlertZero server logger (`plugins.alertzero.telemetry`), never to the workflow event log or the step output, so the step cannot be used to probe other executions.

| Reason | Level |
|---|---|
| `opted_out`, `test_run`, `not_managed`, `lineage_unavailable`, `not_catalog_root`, `aborted` | debug |
| `invalid_input` (issue paths and codes only, never the rendered values), `report_error` | warn |
