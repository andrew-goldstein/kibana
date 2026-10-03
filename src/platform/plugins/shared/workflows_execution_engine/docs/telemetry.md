# Workflows Execution Engine Telemetry: execution lineage

The engine reports its event-based telemetry (EBT) through `WorkflowExecutionTelemetryClient`
(`server/lib/telemetry/workflow_execution_telemetry_client.ts`). Each field's `_meta.description` in
`server/lib/telemetry/events/workflows_execution/index.ts` is the field-level reference. This document covers only the
execution lineage fields and how to join a sub-workflow chain with them.

## Lineage fields

`workflows_execution_workflow_completed`, `_failed` and `_cancelled` carry two optional keyword fields.
`workflows_event_driven_execution_suppressed` never carries them.

| Field | Description |
|---|---|
| `parentWorkflowExecutionId` | The execution id of the parent run that started this run. Present for every sub-workflow run (`triggerType: workflow-step`), absent for a top-level run. |
| `rootWorkflowExecutionId` | The execution id of the top-level run at the root of the chain. A top-level run reports its own `workflowExecutionId`. Every descendant of one top-level run reports that run's id, at any depth. |

## Join rule

- **Group a chain by `rootWorkflowExecutionId`.** Read the chain's outcome from the event whose `workflowExecutionId`
  equals it.
- **A missing `rootWorkflowExecutionId` means the root is unknown.** The root is carried in each child's execution
  context. A child started by a parent that ran before the root was recorded has `parentWorkflowExecutionId` but no
  `rootWorkflowExecutionId`, and so do its own descendants. The engine never guesses a root.
- **The root workflow id is not reported.** Read it from the root run's own event (`workflowId`).
- **Older data lacks these fields.** Runs from releases that predate this change report neither lineage field. Runs from
  releases that also predate the fix that keeps the stored context on the terminal save report `compositionDepth: 1`
  for every child and omit `parentWorkflowId` and `parentWorkflowInvocation`.
- **`parentWorkflowId` now ships on child runs.** Since the terminal save keeps the stored parent keys, child events
  carry `parentWorkflowId`. For customer workflows that id is usually built from the workflow name
  (`generateWorkflowId` in `workflows_management/common/lib/import/index.ts`).

## Where the lineage is stored

`workflow.execute` and `workflow.executeAsync` write `rootWorkflowExecutionId` and `rootWorkflowId` into the child's
execution context bag, next to `parentWorkflowExecutionId` and `parentWorkflowId`. These keys are not exposed to
workflow authors: Liquid templates, step context and autocomplete do not see them, and `parent` still describes only the
direct parent. They are visible through `WorkflowExecutionDto.context` and the executions API. Nothing outside the
engine reads the `root*` keys.

## Known issues

Two existing fields do not match their descriptions, left for the Workflows team's own follow-up:
- `errorHandled` is `true` when a failed step is present and the run failed, which is the opposite of "handled by an
  on-failure handler".
- `startedAt` is the execution's `createdAt`, not the time the run began executing.
