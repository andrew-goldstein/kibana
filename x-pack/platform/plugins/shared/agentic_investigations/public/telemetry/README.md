# Agentic investigations browser telemetry

One Event-Based Telemetry (EBT) event, sent from the browser through core analytics, so opted-out clusters send nothing. It is registered in the public plugin's `setup()`. The server events are documented in [`server/telemetry/README.md`](../../server/telemetry/README.md).

## `agentic_investigations_ui_flyout_interaction`

Sent once when something a user does in an Investigation or Escalation flyout has succeeded. A failed or cancelled action sends nothing.

| Field | Type | Description |
|---|---|---|
| `interaction` | keyword | `status_edit`, `severity_edit`, `assignee_edit`, `open_chat`, `open_activity` or `section_expand` |
| `template_id` | keyword | `investigation` or `escalation` |

Where it is sent from:

- `status_edit`: the flyout's status toggle (a close or reopen of an Investigation or Escalation), and the flyout footer's "Close investigation" modal. The same modal also opens from a solution's queue page, where it sends nothing, because only the flyout registration passes it `onClosed`.
- `assignee_edit`: the flyout header's assignee picker, once the assignment is saved. Each saved change to the selection counts once, so editing several assignees in one visit sends one event per change.
- `open_chat`: the Investigation flyout footer's "Open chat" button. It isn't shown when the flyout was opened from within the chat.

The schema keeps every interaction the telemetry epic names, so adding a control later needs no schema change. Today the flyout has no severity editor, no activity tab and no expandable sections, so `severity_edit`, `open_activity` and `section_expand` are never sent yet.

## Privacy

No ids, names, assignees, values or free text: only which kind of control was used, and on which template. Templates are registered in code, so `template_id` is a fixed value. Reporting never throws, and does nothing where no analytics service is available.
