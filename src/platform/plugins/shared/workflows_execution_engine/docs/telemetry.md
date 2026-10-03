# Workflows Execution Engine Telemetry

The execution engine reports event-based telemetry (EBT) through core analytics. `WorkflowExecutionTelemetryClient`
(`server/lib/telemetry/workflow_execution_telemetry_client.ts`) registers every event type during plugin setup and owns
all reporting.

- Schemas: `server/lib/telemetry/events/workflows_execution/index.ts`. Each field's `_meta.description` is the
  field-level source of truth.
- Payload types: `server/lib/telemetry/events/workflows_execution/types.ts`.
- Field extraction: `server/lib/telemetry/utils/extract_execution_metadata.ts` (execution) and
  `server/lib/telemetry/utils/extract_workflow_metadata.ts` (definition).

This document covers what the descriptions can't: when each event fires, what the fields really measure, which runs
report nothing, and how the schemas may change.

The Workflows Management plugin reports its own UI and management events (`workflows_workflow_*` and others). They are
defined in `workflows_management/public/common/lib/telemetry/` and are not covered here.

## Reporting rules

- A rejected event never fails a run: `reportEvent` errors are caught and logged at `error`.
- The engine applies no gating of its own. Every run reports, including test runs, so filter on `isTestRun`. Delivery
  follows the cluster's telemetry opt-in like any other EBT event.
- The engine does not report a "started" event. Runs are only visible once they end.

## Events

| Event type | Fired when |
|---|---|
| `workflows_execution_workflow_completed` | A run ends with status `completed`. |
| `workflows_execution_workflow_failed` | A run ends with status `failed` or `timed_out`. A timed-out run is a failed event with `timedOut: true`. |
| `workflows_execution_workflow_cancelled` | A run ends with status `cancelled`. |
| `workflows_event_driven_execution_suppressed` | An event-driven run's task starts after event-driven execution was disabled. The run is written as `skipped`. |
| `workflows_trigger_event_dispatched` | `emitEvent` finishes resolving the trigger's subscribed workflows, whether or not any were scheduled. |

The three terminal events have one call site, `reportTelemetryIfTerminal` in
`server/workflow_context_manager/workflow_execution_runtime_manager.ts`. It fires once per runtime manager, when the
execution loop saves a terminal status. A run whose terminal status is written elsewhere reports nothing (see
[Lower bounds](#lower-bounds-runs-that-report-nothing)). `skipped` never reports a terminal event.

`workflows_event_driven_execution_suppressed` fires from `server/execution_functions/run_workflow.ts`.
`workflows_trigger_event_dispatched` fires from `server/trigger_events/trigger_event_handler.ts`. It is not reported
when the trigger fails validation or subscriber resolution throws.

## Event fields

Every event also carries `eventName`, a fixed human-readable label for the event type.

### Identity and trigger

On the three terminal events and on `workflows_event_driven_execution_suppressed`.

| Field | Description |
|---|---|
| `workflowExecutionId` | The execution id. |
| `workflowId` | The workflow id. |
| `spaceId` | The space id. |
| `triggerType` | `manual`, `scheduled`, `alert`, `workflow-step` (a sub-workflow run), or `event` (an event-driven trigger). An unrecognized `triggeredBy` reports as `manual`. |
| `eventTriggerId` | The registered trigger id (for example `cases.caseCreated`), only when `triggerType` is `event`. |
| `isTestRun` | Whether the run is a test run. |
| `isManaged` | Whether the run belongs to a managed workflow. |
| `managedBy` | The owning plugin of a managed workflow. |
| `originManagedWorkflowId` | The registered managed workflow definition id the run came from. |
| `managedVersion` | The registered managed workflow definition version the run came from. |
| `ruleId` | The alerting rule id, only when `triggerType` is `alert` and the event carries one. |
| `eventChainDepth` | The event-chain depth of a run scheduled from an event-driven emit. This is not sub-workflow nesting (see `compositionDepth`). |

### Composition and lineage

On the three terminal events, and only for sub-workflow runs (`triggerType: workflow-step`, started by
`workflow.execute` or `workflow.executeAsync`). Top-level runs omit every field in this group, and
`workflows_event_driven_execution_suppressed` never carries them.

| Field | Description |
|---|---|
| `compositionDepth` | Nesting depth: `1` for a direct child of a top-level run, `2` for a grandchild, and so on. |
| `parentWorkflowId` | The workflow id of the parent that started this run. |
| `parentWorkflowInvocation` | `sync` (`workflow.execute`) or `async` (`workflow.executeAsync`). |
| `parentWorkflowExecutionId` | The execution id of the parent run that started this run. Present for every child. |
| `rootWorkflowExecutionId` | The execution id of the top-level run at the root of the chain. Present only when the chain records a root. |

- **Root is the chain's top-level run.** Every descendant of one top-level run shares its `rootWorkflowExecutionId`, at
  any depth. To group all the runs of one chain, use `rootWorkflowExecutionId ?? workflowExecutionId`: a top-level run
  omits `rootWorkflowExecutionId` because its own `workflowExecutionId` is the root.
- **Chains that straddle an upgrade have no root.** Lineage is carried in each child's execution context. A child started
  by a parent that ran before the root was recorded has `parentWorkflowExecutionId` but no `rootWorkflowExecutionId`, and
  so do its own descendants.
- **The root workflow id is not reported.** Resolve it from the root run's own event.
- **Older data is incomplete.** Events from versions that predate `parentWorkflowExecutionId` can report
  `compositionDepth: 1` for every child and omit `parentWorkflowId` and `parentWorkflowInvocation`.
- Steps and Liquid templates see the same lineage as the `root` context object (`root.workflowId`,
  `root.executionId`). For a top-level run, `root` is the run itself.

### Timing

On the three terminal events.

| Field | Description |
|---|---|
| `startedAt` | Despite its name, the execution's `createdAt`: when the run was created, not when it began executing. |
| `completedAt` / `failedAt` / `cancelledAt` | The terminal timestamp: the execution's `finishedAt` (completed, failed) or `cancelledAt` (cancelled), else the report time. |
| `duration` | Terminal timestamp minus `createdAt`, in ms. It includes time spent queued before start and time parked in waits (`wait`, human input, sync children). It differs from the persisted execution `duration`, which is measured from `startedAt`. |
| `timeToFirstStep` | Earliest step start minus the execution's real `startedAt`, in ms. Absent when no step ran. |
| `queueDelayMs` | Time from being queued or scheduled to starting, in ms. From the concurrency queue metrics when present, else `startedAt - taskRunAt` for scheduled runs. Otherwise absent. |
| `emitToStartMs` | Time from the event dispatch to the execution's real `startedAt`, in ms. Only for event-driven runs with dispatch metadata. |
| `stepDurations` | One entry (`stepId`, `stepType`, `duration`) per step execution with a recorded execution time. |
| `stepAvgDurationsByType` | Average step duration keyed by step type, with dots replaced by underscores (`elasticsearch.search` becomes `elasticsearch_search`). |

### Workflow definition

On the three terminal events. These describe the definition the run executed, not what happened.

| Field | Description |
|---|---|
| `stepCount` | Steps in the definition, including nested `steps`, `else` and `fallback` steps. |
| `stepTypes` | Distinct step types in the definition. |
| `connectorTypes` | Distinct connector types (the step type's prefix) of steps that declare a `connector-id`. |
| `hasScheduledTriggers` / `hasAlertTriggers` | Whether the definition declares a `scheduled` / `alert` trigger. |
| `hasTimeout` | Whether the definition declares `settings.timeout`. The default ceiling (see `timedOut`) does not count. |
| `hasConcurrency` | Whether the definition declares `settings.concurrency`. |
| `hasOnFailure` | Whether the definition declares a workflow-level `settings.on-failure`. Step-level handlers do not count. |

### Execution shape

On the three terminal events.

| Field | Description |
|---|---|
| `executedStepCount` | Step executions recorded for the run. A step that runs several times (loop bodies, retries) counts each time. |
| `successfulStepCount` | Step executions with status `completed`. |
| `failedStepCount` / `skippedStepCount` | Step executions with status `failed` / `skipped`. Only on `workflows_execution_workflow_completed`. |
| `uniqueStepIdsExecuted` | Distinct step ids executed. |
| `executedConnectorTypes` | Distinct connector types (the prefix of dotted step types) among executed steps. |
| `maxExecutionDepth` | The deepest scope stack of any step execution (nesting of `foreach`, `if` and similar blocks). |
| `hasRetries` | Whether any step id was executed more than once. See [Semantics](#semantics-to-know). |
| `hasErrorHandling` | Whether a step failed while the run neither failed nor was cancelled. See [Semantics](#semantics-to-know). |

### Timeout

On the three terminal events.

| Field | Description |
|---|---|
| `timedOut` | Whether the run ended with status `timed_out`. |
| `timeoutMs` | The declared `settings.timeout`, in ms, when it parses. |
| `timeoutExceededByMs` | How far the run overshot `timeoutMs`, measured from the execution's real `startedAt`. Only when `timedOut` and `timeoutMs` are both set. |

### Failure

On `workflows_execution_workflow_failed`.

| Field | Description |
|---|---|
| `errorMessage` | The stored workflow error message, else `Unknown error`. |
| `errorType` | The stored workflow error type (for example `TimeoutError`), else `ExecutionError`. |
| `failedStepId` / `failedStepType` | The first step execution with status `failed`, when there is one. |
| `errorHandled` | `true` when the run has a failed step and its status is `failed`. See [Semantics](#semantics-to-know). |

### Cancellation

On `workflows_execution_workflow_cancelled`.

| Field | Description |
|---|---|
| `cancellationReason` | The stored cancellation reason (for example `Cancelled by user`). |
| `cancelledBy` | `system` or `workflow`, when stored. See [Semantics](#semantics-to-know). |

### Usage and output size

On the three terminal events, when recorded.

| Field | Description |
|---|---|
| `inputTokensUsed` / `outputTokensUsed` / `cachedTokensUsed` / `totalTokensUsed` | LLM token totals across token-reporting steps. `cachedTokensUsed` is a subset of `inputTokensUsed`. |
| `aiStepsUsage` | Per-step token usage (`stepId`, optional `connectorId`, and the four token counts), in finish order. |
| `totalOutputSizeBytes` / `averageOutputSizeBytes` | Output size across steps with a recorded size (atomic steps measured by the step output size limit). |

### Suppressed-only

| Field | Description |
|---|---|
| `logTriggerEventsEnabled` | Whether trigger-event audit logging was enabled when the run was suppressed. |

### Trigger event dispatched

`workflows_trigger_event_dispatched` describes one `emitEvent` call, not an execution.

| Field | Description |
|---|---|
| `triggerId` | The registered trigger id. |
| `eventId` | The dispatch id. It matches the trigger-events audit record, `context.metadata.eventId`, and the scheduled executions' `dispatchEventId`. |
| `executionEnabled` / `logEventsEnabled` | Whether event-driven execution / trigger-event audit logging was enabled. |
| `auditOnly` | Execution was disabled but audit logging still ran. |
| `eventChainDepth` | The event-chain depth at this emit (`0` for an emit outside any chain). |
| `sourceExecutionId` | The execution id of the chain hop that emitted, when there is one. |
| `subscriberResolutionMs` | Time spent resolving and filtering subscribed workflows, in ms. |
| `subscribedCount`, `disabledCount`, `connectorIdMismatchCount`, `kqlFalseCount`, `kqlErrorCount`, `matchedCount`, `depthSkippedCount`, `workflowEventsIgnoreSkippedCount`, `workflowEventsCycleSkippedCount` | The resolution funnel: subscribed workflows found, then those dropped at each filter, and those matched. |
| `scheduledAttemptCount`, `scheduledSuccessCount`, `scheduledFailureCount` | Schedule calls made for matched workflows, and their outcomes. All `0` when nothing was scheduled. |

## Semantics to know

- **`startedAt` is `createdAt`,** so `duration` includes queue time and park time. For time spent executing, use
  `timeToFirstStep` and `stepDurations`; for time spent queued, use `queueDelayMs`.
- **`timedOut` is set only by the workflow-level ceiling.** Every run has one: the declared `settings.timeout`, or a
  default of 6h when none is declared. A step-level timeout fails the step (and the run, unless it is handled), so it
  reports `timedOut: false`. `timeoutMs` and `hasTimeout` reflect only a declared timeout, so a run that hits the default
  ceiling reports `timedOut: true` with no `timeoutMs` and no `timeoutExceededByMs`.
- **A timed-out run reports `workflows_execution_workflow_failed`,** with `timedOut: true` and `errorHandled: false`.
  The timeout marks the interrupted steps `failed`, so the event can report `hasErrorHandling: true`.
- **`hasRetries` means a step id repeated,** which is also true for every `foreach` or `while` body that ran more than
  once. It is not a reliable retry signal. Prefer `hasErrorHandling`, together with `failedStepCount` on completed runs.
- **`hasErrorHandling` is only meaningful on `workflows_execution_workflow_completed`.** It is always `false` on failed
  and cancelled runs, apart from the timed-out case above.
- **`errorHandled` does not mean an on-failure handler absorbed the error,** despite its schema description. It is
  `true` when a failed step is present and the run failed, which is the opposite case.
- **`cancelledBy` does not identify the canceller.** A cancel through the API (a user) records `system`, as do
  concurrency cancels and Task Manager aborts. `workflow` means the workflow cancelled itself. A generic task abort
  records no `cancelledBy`.
- **Cancelling a parked run reports.** A run waiting in a `wait` or human-input step is woken to finish its cancel, so
  it reports `workflows_execution_workflow_cancelled`.

## Lower bounds: runs that report nothing

Every count built from these events is a lower bound on real runs. A run reports nothing when its terminal status is
written outside the execution loop, or when the loop never saves it:

- **Cancelled before it ran.** Cancelling a `pending` or `queued` run writes `cancelled` directly
  (`server/execution_functions/cancel_workflow.ts`).
- **Concurrency `cancel-in-progress`.** It bulk-writes `cancelled` (`server/concurrency/concurrency_manager.ts`). Runs
  that are parked or not yet running at that moment are skipped when their task wakes, so they report nothing.
- **Skipped runs.** No event for `skipped`: concurrency `drop`, a full queue, an expired queue wait, a failed queue
  promotion, or a scheduled tick that overlaps a non-terminal run. The one exception is event-driven suppression, which
  reports `workflows_event_driven_execution_suppressed`.
- **Task recovery.** Runs that Task Manager recovery marks `failed` after a crash or a lost task
  (`server/lib/task_recovery.ts`).
- **Pre-run failures.** Input validation failures (`server/lib/validate_workflow_inputs.ts`), definitions that fail to
  build an execution graph (`server/execution_functions/setup_dependencies.ts`), and execution identity failures
  (`server/execution_functions/finalize_workflow_identity_failure.ts`).
- **Crashes.** A Kibana restart or crash mid-run, before the terminal status is saved.
- **Delivery.** EBT drops events when its queue is full, when sending fails, or while the cluster is opted out.

## What payloads contain

- Ids are reported raw: `workflowExecutionId`, `workflowId`, `spaceId`, the parent and root ids, `ruleId`,
  `sourceExecutionId`, `eventId`, step ids (`failedStepId`, `stepDurations`, `aiStepsUsage`) and connector ids
  (`aiStepsUsage`).
- `errorMessage` and `cancellationReason` are free text (`text` fields). Every other string is a keyword.
- No workflow inputs, step inputs or step outputs are reported.

## Consumers

The Workflows team uses these events for run reliability and engine performance.

Managed-workflow consumers (plugins that register managed workflows) use them to measure their own runs:

- Select their runs with `originManagedWorkflowId` (or `managedBy`) and exclude `isTestRun: true`.
- Group a multi-workflow run with `rootWorkflowExecutionId ?? workflowExecutionId`, and read the chain's outcome from
  the top-level run's event.
- Treat counts as lower bounds (see above). A missing top-level terminal event is not evidence that the run succeeded.

## Change policy

Consumers build long-lived dashboards on these fields, so the schemas change additively only:

- **Add, don't change.** A new field is optional and carries a `_meta.description`. Existing fields are never removed,
  renamed or retyped.
- **A meaning change is a new field.** When what a field measures must change (for example `startedAt` becoming the
  real start time), add a field under a new name and report both for a deprecation period. Keep the old one unchanged
  until its consumers have moved.
- **Update this document** in the same change as the schema.
- **Test against the real schema.** `server/lib/telemetry/events/workflows_execution/index.test.ts` registers the
  schemas on EBT's development-mode validator, which rejects missing required fields and unknown keys. Extend it for new
  fields. `coreMock` analytics does not validate payloads.
