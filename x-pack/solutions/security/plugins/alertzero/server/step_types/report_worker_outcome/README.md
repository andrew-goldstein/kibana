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

Liquid renders a missing value as `''`, so every count and flag treats `''` and `null` as absent, and a count or flag also accepts the text a `{{ }}` template renders (`'12'`, `'true'`). Prefer `${{ }}` typed values with a `default`. The engine does not apply the input schema at runtime, so the handler parses it itself.

## Output

`{ reported: boolean }` and nothing else. The step never throws, so a telemetry problem never fails a Worker run. Still run it with `on-failure: continue` and a short `timeout`, and never inside a `parallel` branch or a `waitForApproval` branch.

## What it verifies

In order, stopping at the first failure:

1. The input parses. Otherwise `invalid_input`.
2. The run is not aborted (checked again before every Elasticsearch read and immediately before reporting). Otherwise `aborted`.
3. The step's own execution is not a test run. Otherwise `test_run`.
4. AlertZero's owner-bound managed workflows client knows the reporting workflow, in the execution space or else the global space. Otherwise `not_managed`.
5. The run's root execution, read once through the Workflows management setup API with `omitStepExecutions` (5s budget). The engine carries the chain's root in every execution's context (`root: { workflowId, executionId }`), so the step reads that execution directly and never the ones between it and the reporter. The persisted root must be the named workflow's execution, in the same space (compared explicitly), not a test run, managed by `alertzero`, and have no parent of its own.
6. The root is a catalog Worker (`originManagedWorkflowId` in `SYSTEM_SECURITY_WORKER_IDS`). Otherwise `not_catalog_root`.

A missing or unreadable root, a timeout, a root in another space or of another workflow, or a root that has a parent is `lineage_unavailable`. The envelope is then built from the verified root, as for every Worker run event.

**Fallback for pre-upgrade chains.** An execution whose chain started before the engine carried root lineage (for example a review parked across the upgrade) has no `root` in its context. For those, step 5 walks the persisted ancestors instead, starting at the reporting execution: at most 10 parent hops, 5s per read, every hop in the same space, not a test run, and managed by `alertzero`. Parents are read from both context shapes (`parentWorkflowExecutionId`, and the `parent.executionId` a terminal save rewrites it to). A missing or unreadable ancestor, a cycle or a chain that is too deep is `lineage_unavailable`.

Caller verification is best-effort until the engine exposes a trusted execution identity.

## Skip reasons

A skip is written to the AlertZero server logger (`plugins.alertzero.telemetry`), never to the workflow event log or the step output, so the step cannot be used to probe other executions.

| Reason | Level |
|---|---|
| `test_run`, `not_managed`, `lineage_unavailable`, `not_catalog_root`, `aborted` | debug |
| `invalid_input` (issue paths and codes only, never the rendered values), `report_error` | warn |
