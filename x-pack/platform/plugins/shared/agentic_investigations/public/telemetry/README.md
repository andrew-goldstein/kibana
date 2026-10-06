# Agentic investigations browser telemetry

One Event-Based Telemetry (EBT) event, sent from the browser through core analytics, so opted-out clusters send nothing. It is registered in the public plugin's `setup()`. The server events are documented in [`server/telemetry/README.md`](../../server/telemetry/README.md).

## `agentic_investigations_ui_flyout_interaction`

Sent once for something a user does in an Investigation or Escalation flyout. Edits are sent once they have succeeded, so a failed or cancelled edit sends nothing; `open_chat` is sent on click, before the chat opens.

| Field | Type | Required | Description |
|---|---|---|---|
| `interaction` | keyword | yes | `status_edit`, `severity_edit`, `assignee_edit`, `open_chat`, `open_activity` or `section_expand` |
| `template_id` | keyword | yes | `investigation` or `escalation` |

Where it is sent from:

- `status_edit`: the flyout's status toggle (a close or reopen of an Investigation or Escalation), and the flyout footer's "Close investigation" modal. The same modal also opens from a solution's queue page, where it sends nothing, because only the flyout registration passes it `onClosed`.
- `assignee_edit`: the flyout header's assignee picker, once the assignment is saved. Each saved change to the selection counts once, so editing several assignees in one visit sends one event per change.
- `open_chat`: the Investigation flyout footer's "Open chat" button. It isn't shown when the flyout was opened from within the chat.

The schema keeps every interaction the telemetry epic names, so adding a control later needs no schema change. Today the flyout has no severity editor, no activity tab and no expandable sections, so `severity_edit`, `open_activity` and `section_expand` are never sent yet.

## Reading it

- **It doesn't tell solutions apart.** Every solution's Investigations use the same `investigation` template, so `template_id` is the same for all of them. The event carries no id to join on; only the automatic page context (the page URL) can separate solutions.
- **It won't match the server counts.** A close that lands on the server but whose response the browser never sees (a client timeout) sends the server's `agentic_investigations_investigation_closed` and no `status_edit`, and the queue page's closes send only the server event.
- **Filter to the known values.** Browser events come from the user's session, which can send any values, and production doesn't validate them against the schema. Count only the `interaction` and `template_id` values listed above.

## Privacy

No ids, names, assignees, values or free text: only which kind of control was used, and on which template. `template_id` is typed as the two template ids registered in code, and the report hook drops any other value. Reporting never throws, and does nothing where no analytics service is available.
