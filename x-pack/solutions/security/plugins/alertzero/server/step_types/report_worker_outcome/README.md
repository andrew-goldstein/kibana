# `alertzero.reportWorkerOutcome`

A workflow step that reports an allowlisted AlertZero Worker outcome as an EBT event (see the [telemetry README](../../telemetry/README.md)). It is the only way Worker YAML can emit an outcome. It is registered on the server and in the browser only when `xpack.alertzero.enabled` is on.

## Input

`with` is a closed union keyed by `event`. Each branch accepts only enums, bounded integer counts and booleans; the one id is the Worker's own `investigation_id`, which must be a UUID. Unknown keys fail the parse.

`worker_run_completed` and `worker_investigation_closed` are for any catalogued Worker: the step takes the Worker from the run's root (the envelope's `worker_id`), never from the input. Every other event belongs to one Worker, and the step reports it only when the run's root is that Worker (`event_worker_ids.ts`): the four `ad_worker_*` events to Attack Discovery, the two `alert_triage_*` events to Alert Triage, `rule_tuning_review_completed` to Rule Tuning, `rule_coverage_review_completed` to Rule Coverage, `hunt_report_completed` to Continuous Threat Hunt and `endpoint_analysis_completed` to Endpoint Analysis.

| `event` | Reports | Fields |
|---|---|---|
| `ad_worker_run_completed` | `alertzero_ad_worker_run_completed` | `alerts_analyzed`, `batches_total`, `batches_failed`, `attacks_generated`, `attacks_persisted` (counts, default `0`), `run_outcome` (required) |
| `ad_worker_review_started` | `alertzero_ad_worker_review_started` | `investigation_id` (UUID, optional), `is_rereview` (optional) |
| `ad_worker_analysis_completed` | `alertzero_ad_worker_analysis_completed` | `verdict` (required), `analysis_error` (default `false`) |
| `ad_worker_handoff_resolved` | `alertzero_ad_worker_handoff_resolved` | `outcome` (required), `verdict` (optional), `auto_approve_requested` (optional) |
| `worker_investigation_closed` | `alertzero_worker_investigation_closed` | `investigation_id` (UUID, required), `close_reason` (required, the Investigation template's close reason, or the class the Worker's close maps to) |
| `worker_run_completed` | `alertzero_worker_run_completed` | `run_outcome` (required), `degraded` (default `false`), `degraded_reason` (default `none`), `candidates_found`, `items_dispatched`, `items_failed`, `items_in_flight` (counts, default `0`), `source_read_failed`, `lookup_failed` (default `false`) |
| `alert_triage_batch_classified` | `alertzero_alert_triage_batch_classified` | `alerts_total`, `verdicts_true_positive`, `verdicts_false_positive`, `verdicts_inconclusive`, `alerts_without_verdict`, `fp_candidates`, `fp_below_floor` (counts), `investigation_id` (UUID, optional) |
| `alert_triage_closure_resolved` | `alertzero_alert_triage_closure_resolved` | `outcome` (required), `alerts_proposed`, `alerts_retag_failed` (counts), `auto_approve_requested`, `proposal_read_failed` (flags), `investigation_id` (UUID, optional) |
| `rule_tuning_review_completed` | `alertzero_rule_tuning_review_completed` | `entry_gate`, `change_type`, `decision` (required), `confidence` (default `none`), `applied`, `backtest_ran`, `backtest_reduced_alerts`, `rule_unavailable` (flags), `investigation_id` (UUID, optional) |
| `rule_coverage_review_completed` | `alertzero_rule_coverage_review_completed` | `verdict`, `proposal_kind`, `decision` (required), `applied`, `approved_not_applied`, `rule_created`, `creation_skipped`, `creation_failed`, `check_failed`, `ki_processed` (flags), `investigation_id` (UUID, optional) |
| `hunt_report_completed` | `alertzero_hunt_report_completed` | `hunt_status`, `package_status` (required), `mint_suppression` (default `none`), `has_confirmed_hit`, `closed_clean` (flags), `tier2_invoked` (optional), `proposals_prepared`, `proposals_dispatch_failed`, `coverage_kis_written`, `coverage_kis_skipped` (counts), `investigation_id` (UUID, optional) |
| `endpoint_analysis_completed` | `alertzero_endpoint_analysis_completed` | `analysis_outcome` (required), `reused_prior_assessment`, `host_resolved`, `agent_failed`, `timeline_found`, `iocs_found`, `findings_attached`, `auto_approve_requested` (flags), `actions_recommended`, `proposals_dispatched`, `proposals_dispatch_failed` (counts) |

Liquid renders a missing value as `''`, so every count and flag treats `''` and `null` as absent, and a count or flag also accepts the text a `{{ }}` template renders (`'12'`, `'true'`). Prefer `${{ }}` typed values with a `default`. The engine does not apply the input schema at runtime, so the handler parses it itself.

## Shipped callers

Worker YAML in `@kbn/workflows/managed` (`definitions/alertzero/`) calls the step. Each report step has `on-failure: continue` and `timeout: 30s`. The Attack Discovery Worker's steps are top-level steps, except `report_investigation_closed_false_positive`, which sits in the verdict switch's `false_positive` arm (a switch arm, unlike a `parallel` branch, accepts both).

| Workflow | Step | `event` | Placement |
|---|---|---|---|
| `attack_discovery_runner.yaml` | `report_run_completed` | `ad_worker_run_completed` | After `run_review_batches`, right before `report_worker_run_completed` |
| `attack_discovery_runner.yaml` | `report_worker_run_completed` | `worker_run_completed` | Right after `report_run_completed`, right before `emit_result` |
| `attack_discovery_review.yaml` | `report_review_started` | `ad_worker_review_started` | Right after `verify_investigation` |
| `attack_discovery_review.yaml` | `report_analysis_completed` | `ad_worker_analysis_completed` | Right after `refresh_verdict`, for every verdict |
| `attack_discovery_review.yaml` | `report_investigation_closed_false_positive` | `worker_investigation_closed` | Right after `close_investigation_false_positive` in the `false_positive` arm, only when that close left no error and changed `status` |
| `attack_discovery_review.yaml` | `report_handoff_resolved` | `ad_worker_handoff_resolved` | Right after `record_decision`, only when `resolve_escalation.output.escalate` is true |
| `attack_discovery_review.yaml` | `report_investigation_closed_declined` | `worker_investigation_closed` | Right after `close_investigation_declined`, only when the escalation was declined and that close left no error and changed `status` |

Every other Worker that closes its own Investigation reports the close the same way: right after each `ai.conversation.metadata.patch` step that writes `status: closed`, in the same step list, and only when that close left no error and its `changed_fields` contains `status`. The close reasons each Worker reports are listed in the [telemetry README](../../telemetry/README.md#alertzero_worker_investigation_closed). `worker_close_reports.test.ts` in `definitions/alertzero/` fails when an AlertZero close patch has no report after it.

| Workflow | Step | `event` | Placement |
|---|---|---|---|
| `floor_alert_triage.yaml` (Alert Triage) | `report_batch_classified` | `alert_triage_batch_classified` | Right after `post_comment_classification_results` |
| `floor_alert_triage.yaml` (Alert Triage) | `report_investigation_closed_review_limit`, `report_investigation_closed_no_fp` | `worker_investigation_closed` | Right after each close |
| `floor_alert_triage.yaml` (Alert Triage) | `report_worker_run_completed` | `worker_run_completed` | The last step |
| `floor_alert_triage_review.yaml` (Alert Triage) | `report_investigation_closed_after_approval`, `report_investigation_closed_after_dismissal`, `report_investigation_closed_after_expiry` | `worker_investigation_closed` | Right after each close |
| `floor_alert_triage_review.yaml` (Alert Triage) | `report_closure_resolved` | `alert_triage_closure_resolved` | The last step, after every outcome branch |
| `hunt_continuous_threat_hunt.yaml` (Continuous Threat Hunt) | `report_worker_run_completed` | `worker_run_completed` | The last step, after `report_fan_out`. Each branch ends in `record_report_outcome` (a `data.set`), so the report counts outcomes across branches |
| `hunt_package_report.yaml` (Continuous Threat Hunt) | `report_investigation_closed_benign` | `worker_investigation_closed` | Right after `dismiss_investigation_if_clean` |
| `hunt_package_report.yaml` (Continuous Threat Hunt) | `report_report_completed` | `hunt_report_completed` | Right before `emit_result` |
| `hunt_proposal_gate.yaml` (Continuous Threat Hunt) | `report_investigation_closed_settled` | `worker_investigation_closed` | Right after `close_if_settled` |
| `rule_tuning_worker.yaml` (Rule Tuning sweep) | `report_worker_run_completed` | `worker_run_completed` | Right before `emit_result` |
| `rule_tuning_review.yaml` (Rule Tuning) | `report_investigation_closed_declined`, `report_investigation_closed_applied`, `report_investigation_closed_dismissed` | `worker_investigation_closed` | Right after each close |
| `rule_tuning_review.yaml` (Rule Tuning) | `report_review_completed_declined` | `rule_tuning_review_completed` | Right before `stop_declined`, in the entry gate's `dismissed` arm |
| `rule_tuning_review.yaml` (Rule Tuning) | `report_review_completed_undecided` | `rule_tuning_review_completed` | Right before `stop_expired`, in the entry gate's `expired` arm |
| `rule_tuning_review.yaml` (Rule Tuning) | `report_review_completed` | `rule_tuning_review_completed` | Right before `emit_result` |
| `coverage_worker.yaml` (Rule Coverage sweep) | `report_worker_run_completed` | `worker_run_completed` | Right before `emit_result` |
| `coverage_review.yaml` (Rule Coverage) | `report_investigation_closed_resolved`, `report_investigation_closed_dismissed` | `worker_investigation_closed` | Right after each close, one in each arm of the `close_investigation` switch |
| `coverage_review.yaml` (Rule Coverage) | `report_investigation_closed_declined` | `worker_investigation_closed` | Right after `close_investigation_declined`, in the entry gate's `dismissed` arm |
| `coverage_review.yaml` (Rule Coverage) | `report_review_completed` | `rule_coverage_review_completed` | Right before `emit_result` |

`shipped_yaml_contract.test.ts` renders each of these `with` blocks the way the engine does and validates it against the input schema, so a YAML edit that the schema would reject fails in CI instead of logging `invalid_input` at runtime. `worker_outcome_reports.test.ts` in `definitions/alertzero/` pins what each scenario renders.

## Output

`{ reported: boolean }` and nothing else. The step never throws, so a telemetry problem never fails a Worker run. Still run it with `on-failure: continue` and a short `timeout`, and never inside a `parallel` branch or a `waitForApproval` branch.

## What it verifies

In order, stopping at the first failure:

1. The input parses, and does not contradict itself: a `worker_run_completed` whose `run_outcome` is `degraded_partial` must have `degraded: true`, and `degraded_reason` must be `none` exactly when `degraded` is false (`find_outcome_contradictions.ts`). Otherwise `invalid_input`.
2. The run is not aborted (checked again before every Elasticsearch read and immediately before reporting). Otherwise `aborted`.
3. The step's own execution is not a test run. Otherwise `test_run`.
4. Telemetry is opted in (a 1s read of the telemetry plugin's opt-in; no plugin or no decision counts as opted out). Otherwise `opted_out`. Every check before this one is local, so an opted-out cluster makes no Elasticsearch read.
5. AlertZero's owner-bound managed workflows client knows the reporting workflow, in the execution space or else the global space. Otherwise `not_managed`. With Kibana service accounts off, AlertZero starts no such client, so the step skips as `service_accounts_disabled`; with them on, a missing client is `lineage_unavailable`.
6. The persisted ancestors, read through the Workflows management setup API with `omitStepExecutions`, starting at the reporting execution: at most 10 parent hops, 5s per read, every hop in the same space (compared explicitly), not a test run, and managed by `alertzero`. Parents are read from both context shapes (`parentWorkflowExecutionId`, and the `parent.executionId` a terminal save rewrites it to).
7. The root (the hop with no parent) is a catalog Worker (`originManagedWorkflowId` in `SYSTEM_SECURITY_WORKER_IDS`). Otherwise `not_catalog_root`.
8. A Worker-specific event comes from its own Worker: the root's `originManagedWorkflowId` is the event's owner in `event_worker_ids.ts`. Otherwise `wrong_worker`.

A missing or unreadable ancestor, a timeout, a cycle, a chain that is too deep, or a hop in another space is `lineage_unavailable`. The envelope is then built from the verified root, as for every Worker run event.

The caller check is best-effort.

Verified chains are cached for 10 minutes (500 entries). Each execution of a chain maps to the chain's root and answers only in its own space, so the several reports of one review, and sibling reviews of one runner, skip the reads already made.

## Skip reasons

A skip is written to the AlertZero server logger (`plugins.alertzero.telemetry`), never to the workflow event log or the step output, so the step cannot be used to probe other executions.

| Reason | Level |
|---|---|
| `opted_out`, `test_run`, `not_managed`, `lineage_unavailable`, `service_accounts_disabled`, `not_catalog_root`, `aborted` | debug |
| `invalid_input` (issue paths and codes only, never the rendered values), `wrong_worker` (the event name), `report_error` | warn |
