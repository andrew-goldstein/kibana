# Run telemetry for runs that fail on their service account

A workflow can run as a service account (`settings.run_as`, or `run-as-mode: inherit` on a managed child). Before the
first step of a run, and again before a resumed run continues, the engine asks the security service for a request
scoped to that account. When it can't get one, `run_workflow.ts` or `resume_workflow.ts` ends the run in storage
through `finalize_workflow_identity_failure.ts`, before the runtime starts. The runtime's terminal telemetry never runs
for these runs, so `server/lib/report_workflow_identity_failure_telemetry.ts` reports them instead.

## What is reported

- **The run failed:** `workflows_execution_workflow_failed`, with `errorType: ServiceAccountExecutionError` and one of
  the reasons below as `errorMessage`.
- **A cancellation won the race:** `workflows_execution_workflow_cancelled`, the same as a run cancelled while it
  runs. It carries the stored `cancellationReason` and `cancelledBy`.

The event is built by `WorkflowExecutionTelemetryClient`, so it has the same fields as a run that fails in the runtime:
ids, trigger, managed-workflow and composition fields, and step metrics. It is reported once, by the invocation whose
write ended the run. A later invocation finds the run already terminal and reports nothing, and the runtime never runs
for it. Reporting is best effort: a failure is logged at debug level and never changes how the run is ended.

Reporting starts only after the `workflows.failed` trigger event and the cleanup (waking a waiting parent, draining the
concurrency queue, metering), and nothing waits for it, so neither is delayed by the telemetry step read. It still
reports when the cleanup throws, because only this invocation ended the run.

## Reasons

`errorMessage` is one value from a closed set (`WORKFLOW_IDENTITY_FAILURE_REASONS` in
`server/lib/classify_workflow_identity_failure.ts`). It is never the raw error message, which can name the service
account.

| `errorMessage` | Causes on `main` |
|---|---|
| `service_accounts_disabled` | `xpack.security.serviceAccounts.enabled` is off. Checked first, whatever the error. |
| `service_account_token_exchange_rejected` | The security plugin's `ServiceAccountTokenExchangeError` (matched by its `name`) with `retryable: false`: the exchange failed in a way its retry policy won't retry. On the Elasticsearch backend that's a missing stored credential (the account was deleted), an account deleted and created again, an inconsistent credential, or an Elasticsearch error with a status other than 408, 429 or 5xx. On UIAM it's a UIAM refusal or an invalid UIAM response. The flag doesn't say which of these it was. |
| `service_account_token_exchange_unavailable` | The same error with `retryable: true`: a connection error or timeout, or a 408, 429 or 5xx from Elasticsearch or UIAM. The exchange might succeed later. |
| `service_account_binding_missing` | A 404 `Boom` from the workload binding API: no service account is bound to the workflow. |
| `service_account_binding_refused` | A 403 `Boom` that isn't wrapped: the binding names a different account (it was rebound), the binding failed integrity verification, or bindings or exchanges can't be used (security is off in Elasticsearch, or there is no encryption key). |
| `other_service_account_error` | Anything else, for example an invalid service account id (a 400), an exchange error without a `retryable` flag, or the service accounts service not running. |

## Step metrics

The run's stored step executions are read back by id, so a resumed run that ran steps before it waited reports the
same `executedStepCount`, `successfulStepCount`, `uniqueStepIdsExecuted` and `stepDurations` as the runtime would. A
step that was running or waiting is stored as failed with the run's error, so it shows up as `failedStepId`.

- The read is bounded: at most the newest 10,000 step executions (ids are stored in start order, so the step that was
  waiting is always included), and only the fields telemetry uses, never step inputs or outputs.
- If the read fails, the event is still reported, with no steps.
- A first run that fails before its first step has no steps to read.

## Known issue: `errorHandled`

`errorHandled` on these events uses the engine's existing heuristic: `true` when a failed step is present and the run
failed. A resumed run's waiting step is stored as failed, so these events can read `errorHandled: true` even though
nothing handled the failure. A fix is a follow-up for the Workflows team.

## Raw error text in other failed events

This event sends no raw error text. Other `workflows_execution_workflow_failed` events still send the run's stored
`error.message`, as before. For example, a step running as a service account that gets an Elasticsearch 403 can have a
message that names the principal. That behavior is unchanged here.
