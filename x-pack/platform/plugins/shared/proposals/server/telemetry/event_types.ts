/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EventTypeOpts, RootSchema } from '@kbn/core/server';
import type {
  DismissReason,
  ProposalConfidence,
  ProposalDecision,
  ProposalImpact,
  ProposalOrigin,
  ProposalStatus,
} from '@kbn/proposals-common';
import {
  dismissReasonSchema,
  proposalConfidenceSchema,
  proposalDecisionSchema,
  proposalImpactSchema,
  proposalOriginSchema,
  proposalStatusSchema,
} from '@kbn/proposals-common';
import type {
  ProposalActionOutcome,
  ProposalDurationBucket,
  ProposalExpiresInBucket,
  ProposalExpiryReason,
  ProposalFailureSource,
  ProposalReportedDecisionSource,
  ProposalResumeRejectedReason,
  ProposalSettledReason,
  ProposalTelemetryCategory,
} from './constants';
import {
  ACTION_OUTCOMES,
  CUSTOM_ACTION_ID,
  DECISION_SOURCES,
  DURATION_BUCKETS,
  EXPIRES_IN_BUCKETS,
  EXPIRY_REASONS,
  FAILURE_SOURCES,
  PROPOSALS_TELEMETRY_EVENTS,
  RESUME_REJECTED_REASONS,
  SETTLED_REASONS,
  TELEMETRY_CATEGORIES,
} from './constants';
import { formatVocabulary } from './format_vocabulary';

/** The caller fields every proposals event carries, except the cluster-level snapshot. */
export interface ProposalsCallerFields {
  caller_run_id?: string;
  is_default_space: boolean;
  managed_caller: boolean;
  origin: ProposalOrigin;
}

/** The ids every per-proposal event carries: the proposal's own, and its chain root's. */
export interface ProposalsProposalIdFields {
  proposal_id: string;
  root_proposal_id: string;
}

export interface ProposalsProposalCreatedPayload
  extends ProposalsCallerFields,
    ProposalsProposalIdFields {
  action_id?: string;
  auto_approve_requested: boolean;
  category?: ProposalTelemetryCategory;
  confidence_bucket: ProposalConfidence;
  expires_in_bucket: ProposalExpiresInBucket;
  has_action: boolean;
  impact_class: ProposalImpact;
}

export interface ProposalsProposalDecidedPayload
  extends ProposalsCallerFields,
    ProposalsProposalIdFields {
  attempt: number;
  decided_after_deadline: boolean;
  decision: ProposalDecision;
  decision_source: ProposalReportedDecisionSource;
  dismiss_reason?: DismissReason;
  time_to_decision_ms?: number;
}

export interface ProposalsProposalStatusChangedPayload
  extends ProposalsCallerFields,
    ProposalsProposalIdFields {
  expiry_reason?: ProposalExpiryReason;
  failure_source?: ProposalFailureSource;
  from_status: ProposalStatus;
  to_status: ProposalStatus;
}

export interface ProposalsActionExecutedPayload
  extends ProposalsCallerFields,
    ProposalsProposalIdFields {
  action_id?: string;
  attempt: number;
  category?: ProposalTelemetryCategory;
  execution_duration_ms?: number;
  outcome: ProposalActionOutcome;
}

export interface ProposalsProposalRevisedPayload
  extends ProposalsCallerFields,
    ProposalsProposalIdFields {
  action_input_changed: boolean;
  comment_changed: boolean;
  confidence_changed: boolean;
  impact_changed: boolean;
  revision: number;
}

export interface ProposalsProposalRetriedPayload
  extends ProposalsCallerFields,
    ProposalsProposalIdFields {
  attempt: number;
}

export interface ProposalsProposalResumeRejectedPayload
  extends ProposalsCallerFields,
    ProposalsProposalIdFields {
  reason: ProposalResumeRejectedReason;
}

/** A settled status a chain head can hold. `superseded` is never a head. */
export type ProposalSettledStatus = Exclude<ProposalStatus, 'pending' | 'executing' | 'superseded'>;

export interface ProposalsSnapshotAgeBucketCount {
  age_bucket: ProposalDurationBucket;
  count: number;
}

export interface ProposalsSnapshotSettledCount {
  count: number;
  reason?: ProposalSettledReason;
  status: ProposalSettledStatus;
}

export interface ProposalsSnapshotPayload {
  executing_by_age: ProposalsSnapshotAgeBucketCount[];
  pending_by_age: ProposalsSnapshotAgeBucketCount[];
  pending_overdue_by_age: ProposalsSnapshotAgeBucketCount[];
  settled: ProposalsSnapshotSettledCount[];
  snapshot_day: string;
  space_count: number;
}

/** The payload each proposals event type carries. */
export interface ProposalsTelemetryEventPayloads {
  [PROPOSALS_TELEMETRY_EVENTS.ProposalCreated]: ProposalsProposalCreatedPayload;
  [PROPOSALS_TELEMETRY_EVENTS.ProposalDecided]: ProposalsProposalDecidedPayload;
  [PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged]: ProposalsProposalStatusChangedPayload;
  [PROPOSALS_TELEMETRY_EVENTS.ActionExecuted]: ProposalsActionExecutedPayload;
  [PROPOSALS_TELEMETRY_EVENTS.ProposalRevised]: ProposalsProposalRevisedPayload;
  [PROPOSALS_TELEMETRY_EVENTS.ProposalRetried]: ProposalsProposalRetriedPayload;
  [PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected]: ProposalsProposalResumeRejectedPayload;
  [PROPOSALS_TELEMETRY_EVENTS.Snapshot]: ProposalsSnapshotPayload;
}

const ACTION_ID_DESCRIPTION = `The action workflow's registered managed workflow definition id (its \`originManagedWorkflowId\`), resolved once when the proposal was created and kept by its retries and revisions, or \`${CUSTOM_ACTION_ID}\` for a workflow no plugin manages. Never a customer-chosen workflow id. Absent when the proposal has no action, or its action workflow could not be read at creation`;
const ATTEMPT_DESCRIPTION =
  'Clone generation of the proposal: 1 for the first attempt, plus one for each retry after a failed action. A revision does not increment it';
const CATEGORY_DESCRIPTION = `Action category (${formatVocabulary(
  TELEMETRY_CATEGORIES
)}); any category outside the known vocabulary ships as \`other\`. Absent when the proposal has none`;
const DURATION_BUCKET_VOCABULARY = formatVocabulary(DURATION_BUCKETS);
const SNAPSHOT_COUNT_DESCRIPTION = 'Number of chain heads in the bucket, summed across spaces';

const CALLER_FIELDS_SCHEMA: RootSchema<ProposalsCallerFields> = {
  caller_run_id: {
    type: 'keyword',
    _meta: {
      description:
        "Generated UUID of the root execution of the calling workflow's run, walked through any forwarding workflow (for example `system-create-alertzero-proposal`) and derived server-side on a best-effort basis; joins to the caller's own events (for example AlertZero `run_id`). Absent when it cannot be derived",
      optional: true,
    },
  },
  is_default_space: {
    type: 'boolean',
    _meta: {
      description:
        'Whether the proposal is in the default space. The space id itself is never sent',
      optional: false,
    },
  },
  managed_caller: {
    type: 'boolean',
    _meta: {
      description:
        'Whether every workflow execution from the calling workflow up to the root of its run, through any forwarding workflow, is a managed workflow that is not a test run, verified server-side from the persisted executions on a best-effort basis. False when any of them is not, or cannot be read, and without a calling workflow',
      optional: false,
    },
  },
  origin: {
    type: 'keyword',
    _meta: {
      description: `The feature that produced the proposal (${formatVocabulary(
        proposalOriginSchema.options
      )}), the proposal's own stored \`origin\`, which every retry and revision inherits. Declared by the caller, so \`managed_caller\` is what tells a managed feature's own use from a custom workflow that declared the same value`,
      optional: false,
    },
  },
};

const PROPOSAL_ID_FIELDS_SCHEMA: RootSchema<ProposalsProposalIdFields> = {
  proposal_id: {
    type: 'keyword',
    _meta: {
      description:
        "Generated UUID of the proposal the event is about. A retry or a revision is a new proposal with its own id: for `proposals_proposal_retried` and `proposals_proposal_revised` it is the new one's",
      optional: false,
    },
  },
  root_proposal_id: {
    type: 'keyword',
    _meta: {
      description:
        'Generated UUID of the first proposal in the chain, which every retry and revision inherits; groups a whole chain. Equals `proposal_id` for the first proposal, and for a record written before chain roots were stored',
      optional: false,
    },
  },
};

const AGE_BUCKET_ITEMS_SCHEMA = (ageDescription: string) => ({
  properties: {
    age_bucket: {
      type: 'keyword' as const,
      _meta: {
        description: `${ageDescription}, bucketed: ${DURATION_BUCKET_VOCABULARY}`,
        optional: false as const,
      },
    },
    count: {
      type: 'long' as const,
      _meta: { description: SNAPSHOT_COUNT_DESCRIPTION, optional: false as const },
    },
  },
  _meta: { description: 'One count per age bucket; empty buckets are omitted' },
});

export const PROPOSALS_PROPOSAL_CREATED_EVENT: EventTypeOpts<ProposalsProposalCreatedPayload> = {
  eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalCreated,
  schema: {
    ...CALLER_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
    action_id: {
      type: 'keyword',
      _meta: { description: ACTION_ID_DESCRIPTION, optional: true },
    },
    auto_approve_requested: {
      type: 'boolean',
      _meta: {
        description:
          "Whether the caller asked the gate to auto-approve (its autonomy policy). An action's `always-gate` policy can still force a human decision",
        optional: false,
      },
    },
    category: {
      type: 'keyword',
      _meta: { description: CATEGORY_DESCRIPTION, optional: true },
    },
    confidence_bucket: {
      type: 'keyword',
      _meta: {
        description: `Confidence the proposer declared (${formatVocabulary(
          proposalConfidenceSchema.options
        )})`,
        optional: false,
      },
    },
    expires_in_bucket: {
      type: 'keyword',
      _meta: {
        description: `Decision window the proposal was created with, from creation to its deadline: ${formatVocabulary(
          EXPIRES_IN_BUCKETS
        )} (no deadline)`,
        optional: false,
      },
    },
    has_action: {
      type: 'boolean',
      _meta: {
        description:
          'Whether approving the proposal runs an action workflow (otherwise approval records the decision only)',
        optional: false,
      },
    },
    impact_class: {
      type: 'keyword',
      _meta: {
        description: `Impact snapshotted at creation (${formatVocabulary(
          proposalImpactSchema.options
        )})`,
        optional: false,
      },
    },
  },
};

export const PROPOSALS_PROPOSAL_DECIDED_EVENT: EventTypeOpts<ProposalsProposalDecidedPayload> = {
  eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalDecided,
  schema: {
    ...CALLER_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
    attempt: {
      type: 'long',
      _meta: { description: ATTEMPT_DESCRIPTION, optional: false },
    },
    decided_after_deadline: {
      type: 'boolean',
      _meta: {
        description:
          'Whether the decision was recorded after the deadline. A generic resume can still land between the deadline and the expiry task firing',
        optional: false,
      },
    },
    decision: {
      type: 'keyword',
      _meta: {
        description: `The recorded decision (${formatVocabulary(proposalDecisionSchema.options)})`,
        optional: false,
      },
    },
    decision_source: {
      type: 'keyword',
      _meta: {
        description: `Who decided: ${formatVocabulary(
          DECISION_SOURCES
        )} (autonomy: the caller's autonomy policy auto-approved the gate; unknown: the decision was recorded without a source)`,
        optional: false,
      },
    },
    dismiss_reason: {
      type: 'keyword',
      _meta: {
        description: `The selected dismiss reason (${formatVocabulary(
          dismissReasonSchema.options
        )}); only for a dismissal`,
        optional: true,
      },
    },
    time_to_decision_ms: {
      type: 'long',
      _meta: {
        description:
          "Milliseconds from the chain root's creation (retries and revisions inherit it) to the decision; human decisions only",
        optional: true,
      },
    },
  },
};

export const PROPOSALS_PROPOSAL_STATUS_CHANGED_EVENT: EventTypeOpts<ProposalsProposalStatusChangedPayload> =
  {
    eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged,
    schema: {
      ...CALLER_FIELDS_SCHEMA,
      ...PROPOSAL_ID_FIELDS_SCHEMA,
      expiry_reason: {
        type: 'keyword',
        _meta: {
          description: `Why the proposal expired (${formatVocabulary(
            EXPIRY_REASONS
          )}); only when to_status is \`expired\``,
          optional: true,
        },
      },
      failure_source: {
        type: 'keyword',
        _meta: {
          description: `What failed (${formatVocabulary(
            FAILURE_SOURCES
          )}); only when to_status is \`failed\``,
          optional: true,
        },
      },
      from_status: {
        type: 'keyword',
        _meta: {
          description: `Status before the transition (${formatVocabulary(
            proposalStatusSchema.options
          )})`,
          optional: false,
        },
      },
      to_status: {
        type: 'keyword',
        _meta: {
          description:
            'Status after the transition, with the same vocabulary as from_status. Never `superseded`: a revision or retry reports its own event',
          optional: false,
        },
      },
    },
  };

export const PROPOSALS_ACTION_EXECUTED_EVENT: EventTypeOpts<ProposalsActionExecutedPayload> = {
  eventType: PROPOSALS_TELEMETRY_EVENTS.ActionExecuted,
  schema: {
    ...CALLER_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
    action_id: {
      type: 'keyword',
      _meta: { description: ACTION_ID_DESCRIPTION, optional: true },
    },
    attempt: {
      type: 'long',
      _meta: { description: ATTEMPT_DESCRIPTION, optional: false },
    },
    category: {
      type: 'keyword',
      _meta: { description: CATEGORY_DESCRIPTION, optional: true },
    },
    execution_duration_ms: {
      type: 'long',
      _meta: {
        description:
          'Milliseconds from the approval to the recorded outcome. Absent when the approval time is unknown',
        optional: true,
      },
    },
    outcome: {
      type: 'keyword',
      _meta: {
        description: `How the approved action ended (${formatVocabulary(ACTION_OUTCOMES)})`,
        optional: false,
      },
    },
  },
};

export const PROPOSALS_PROPOSAL_REVISED_EVENT: EventTypeOpts<ProposalsProposalRevisedPayload> = {
  eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRevised,
  schema: {
    ...CALLER_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
    action_input_changed: {
      type: 'boolean',
      _meta: {
        description: "Whether the revision overrode the action's input (the values never ship)",
        optional: false,
      },
    },
    comment_changed: {
      type: 'boolean',
      _meta: {
        description: 'Whether the revision replaced the explanation (the text never ships)',
        optional: false,
      },
    },
    confidence_changed: {
      type: 'boolean',
      _meta: { description: 'Whether the revision changed the confidence', optional: false },
    },
    impact_changed: {
      type: 'boolean',
      _meta: { description: 'Whether the revision changed the impact', optional: false },
    },
    revision: {
      type: 'long',
      _meta: {
        description: '1-based position of the new revision in its chain (2 for the first revision)',
        optional: false,
      },
    },
  },
};

export const PROPOSALS_PROPOSAL_RETRIED_EVENT: EventTypeOpts<ProposalsProposalRetriedPayload> = {
  eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
  schema: {
    ...CALLER_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
    attempt: {
      type: 'long',
      _meta: {
        description: `${ATTEMPT_DESCRIPTION}. This is the new attempt the retry re-offers`,
        optional: false,
      },
    },
  },
};

export const PROPOSALS_PROPOSAL_RESUME_REJECTED_EVENT: EventTypeOpts<ProposalsProposalResumeRejectedPayload> =
  {
    eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected,
    schema: {
      ...CALLER_FIELDS_SCHEMA,
      ...PROPOSAL_ID_FIELDS_SCHEMA,
      reason: {
        type: 'keyword',
        _meta: {
          description: `Why the decision attempt was refused: ${formatVocabulary(
            RESUME_REJECTED_REASONS
          )}`,
          optional: false,
        },
      },
    },
  };

export const PROPOSALS_SNAPSHOT_EVENT: EventTypeOpts<ProposalsSnapshotPayload> = {
  eventType: PROPOSALS_TELEMETRY_EVENTS.Snapshot,
  schema: {
    executing_by_age: {
      type: 'array',
      items: AGE_BUCKET_ITEMS_SCHEMA('Time since the approval'),
      _meta: {
        description:
          'Chain heads still `executing`, by time since approval. A restart mid-action strands proposals here',
      },
    },
    pending_by_age: {
      type: 'array',
      items: AGE_BUCKET_ITEMS_SCHEMA("Time since the chain root's creation"),
      _meta: { description: 'Chain heads still `pending`, by age' },
    },
    pending_overdue_by_age: {
      type: 'array',
      items: AGE_BUCKET_ITEMS_SCHEMA('Time since the deadline'),
      _meta: {
        description:
          'Chain heads still `pending` past their deadline, by overdue time. A gate that was cancelled or never woke up shows here',
      },
    },
    settled: {
      type: 'array',
      items: {
        properties: {
          count: {
            type: 'long',
            _meta: { description: SNAPSHOT_COUNT_DESCRIPTION, optional: false },
          },
          reason: {
            type: 'keyword',
            _meta: {
              description: `Why it settled there (${formatVocabulary(
                SETTLED_REASONS
              )}): an expiry reason for \`expired\`, a failure source for \`failed\`; absent otherwise or when unrecorded`,
              optional: true,
            },
          },
          status: {
            type: 'keyword',
            _meta: {
              description:
                'Settled status (`succeeded`, `failed`, `expired` or `no_action`). Superseded proposals are never chain heads',
              optional: false,
            },
          },
        },
        _meta: { description: 'One count per settled status and reason combination' },
      },
      _meta: { description: 'Settled chain heads (all time), by status and reason' },
    },
    snapshot_day: {
      type: 'keyword',
      _meta: {
        description:
          'UTC day (`YYYY-MM-DD`) the snapshot describes; one snapshot per day, used to dedupe catch-up runs',
        optional: false,
      },
    },
    space_count: {
      type: 'long',
      _meta: {
        description: 'Number of spaces with at least one proposal that the aggregate covers',
        optional: false,
      },
    },
  },
};

/** Every proposals event type, in registration order. */
export const PROPOSALS_TELEMETRY_EVENT_TYPES = [
  PROPOSALS_PROPOSAL_CREATED_EVENT,
  PROPOSALS_PROPOSAL_DECIDED_EVENT,
  PROPOSALS_PROPOSAL_STATUS_CHANGED_EVENT,
  PROPOSALS_ACTION_EXECUTED_EVENT,
  PROPOSALS_PROPOSAL_REVISED_EVENT,
  PROPOSALS_PROPOSAL_RETRIED_EVENT,
  PROPOSALS_PROPOSAL_RESUME_REJECTED_EVENT,
  PROPOSALS_SNAPSHOT_EVENT,
] as const;
