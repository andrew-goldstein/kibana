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
  ProposalExpiresInBucket,
  ProposalExpiryReason,
  ProposalFailureSource,
  ProposalReportedDecisionSource,
  ProposalResumeRejectedReason,
  ProposalRevisionSource,
  ProposalTelemetryCategory,
} from './constants';
import {
  ACTION_OUTCOMES,
  CUSTOM_ACTION_ID,
  DECISION_SOURCES,
  EXPIRES_IN_BUCKETS,
  EXPIRY_REASONS,
  FAILURE_SOURCES,
  PROPOSALS_TELEMETRY_EVENTS,
  RESUME_REJECTED_REASONS,
  REVISION_SOURCES,
  TELEMETRY_CATEGORIES,
} from './constants';
import { formatVocabulary } from './format_vocabulary';

/** The fields every proposals event carries. */
export interface ProposalsCommonFields {
  is_default_space: boolean;
  origin: ProposalOrigin;
  workflow_execution_id?: string;
}

/**
 * The ids every per-proposal event carries: the proposal's own, its chain root's, and the
 * conversation it belongs to.
 */
export interface ProposalsProposalIdFields {
  conversation_id: string;
  proposal_id: string;
  root_proposal_id: string;
}

export interface ProposalsProposalCreatedPayload
  extends ProposalsCommonFields,
    ProposalsProposalIdFields {
  action_id?: string;
  category?: ProposalTelemetryCategory;
  confidence_bucket: ProposalConfidence;
  expires_in_bucket: ProposalExpiresInBucket;
  has_action: boolean;
  impact_class: ProposalImpact;
}

export interface ProposalsProposalDecidedPayload
  extends ProposalsCommonFields,
    ProposalsProposalIdFields {
  decided_after_deadline: boolean;
  decision: ProposalDecision;
  decision_source: ProposalReportedDecisionSource;
  dismiss_reason?: DismissReason;
  time_to_decision_ms?: number;
}

export interface ProposalsProposalStatusChangedPayload
  extends ProposalsCommonFields,
    ProposalsProposalIdFields {
  expiry_reason?: ProposalExpiryReason;
  failure_source?: ProposalFailureSource;
  from_status: ProposalStatus;
  to_status: ProposalStatus;
}

export interface ProposalsActionExecutedPayload
  extends ProposalsCommonFields,
    ProposalsProposalIdFields {
  category?: ProposalTelemetryCategory;
  execution_duration_ms?: number;
  outcome: ProposalActionOutcome;
}

export interface ProposalsProposalRevisedPayload
  extends ProposalsCommonFields,
    ProposalsProposalIdFields {
  action_input_changed: boolean;
  comment_changed: boolean;
  confidence_changed: boolean;
  impact_changed: boolean;
  revision: number;
  revision_source: ProposalRevisionSource;
}

/**
 * Carries only the common and id fields: a chain's attempt count is the number of retried events
 * sharing its `root_proposal_id`.
 */
export type ProposalsProposalRetriedPayload = ProposalsCommonFields & ProposalsProposalIdFields;

export interface ProposalsProposalResumeRejectedPayload
  extends ProposalsCommonFields,
    ProposalsProposalIdFields {
  reason: ProposalResumeRejectedReason;
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
}

const ACTION_ID_DESCRIPTION = `The action workflow's registered managed workflow definition id (its \`originManagedWorkflowId\`), or \`${CUSTOM_ACTION_ID}\` for a workflow no plugin manages. Never a customer-chosen workflow id. Resolved from the action read creation already makes; retries and revisions keep the same action, so later events of the chain join to this one by \`root_proposal_id\`. Absent when the proposal has no action, or its action workflow could not be read`;
const CATEGORY_DESCRIPTION = `Action category (${formatVocabulary(
  TELEMETRY_CATEGORIES
)}); any category outside the known vocabulary ships as \`other\`. Absent when the proposal has none`;

const COMMON_FIELDS_SCHEMA: RootSchema<ProposalsCommonFields> = {
  is_default_space: {
    type: 'boolean',
    _meta: {
      description:
        'Whether the proposal is in the default space. The space id itself is never sent',
      optional: false,
    },
  },
  origin: {
    type: 'keyword',
    _meta: {
      description: `The feature that produced the proposal (${formatVocabulary(
        proposalOriginSchema.options
      )}), the proposal's own stored \`origin\`, which every retry and revision inherits. Declared by the caller: whether the run that asked was a managed feature's own comes from joining \`workflow_execution_id\` to the Workflows engine's run events`,
      optional: false,
    },
  },
  workflow_execution_id: {
    type: 'keyword',
    _meta: {
      description:
        "Engine-generated UUID of the gate workflow execution the proposal was created in, which every retry and revision inherits. Joins to the Workflows engine's run events (`workflowExecutionId`), whose `executionChain` leads to the root run the proposal was asked for in, its first hop (for an AlertZero Worker, the run its own events report as `run_id`); the engine reports a run only when it ends. Not the same run as the `workflow_execution_id` on Agent Builder round events. Absent when the proposal was created outside a workflow",
      optional: true,
    },
  },
};

const PROPOSAL_ID_FIELDS_SCHEMA: RootSchema<ProposalsProposalIdFields> = {
  conversation_id: {
    type: 'keyword',
    _meta: {
      description:
        "The Agent Builder conversation the proposal belongs to, which every retry and revision inherits. For AlertZero this is the Investigation id. Usually a random UUID, but a caller may supply its own: two AlertZero Workers derive theirs from a customer record id (Attack Discovery from the attack's alert id, Hunt from the threat report's id), so it can name a customer record, never a person",
      optional: false,
    },
  },
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
        'Generated UUID of the first proposal in the chain, which every retry and revision inherits; groups a whole chain. Equals `proposal_id` for the first proposal',
      optional: false,
    },
  },
};

export const PROPOSALS_PROPOSAL_CREATED_EVENT: EventTypeOpts<ProposalsProposalCreatedPayload> = {
  eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalCreated,
  schema: {
    ...COMMON_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
    action_id: {
      type: 'keyword',
      _meta: { description: ACTION_ID_DESCRIPTION, optional: true },
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
    ...COMMON_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
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
      ...COMMON_FIELDS_SCHEMA,
      ...PROPOSAL_ID_FIELDS_SCHEMA,
      expiry_reason: {
        type: 'keyword',
        _meta: {
          description: `Why the proposal expired (${formatVocabulary(
            EXPIRY_REASONS
          )}), derived by the server from the write that settled it. deadline: the gate settled it at or after its deadline; settled_early: the gate settled it before, because its attempt budget ran out or the gate workflow failed (the gate run's own engine event tells the two apart); external: written through the \`proposals.updateProposal\` step, outside the gate; gate_ended: the gate execution was cancelled or timed out before anyone decided, and a read or a decision settled it. Only when to_status is \`expired\``,
          optional: true,
        },
      },
      failure_source: {
        type: 'keyword',
        _meta: {
          description: `What failed (${formatVocabulary(
            FAILURE_SOURCES
          )}). action: the approved action failed; workflow_failure: the gate workflow's failure handler settled it; gate_ended: the gate execution was cancelled or timed out while the action ran, and a read or a decision settled it. Only when to_status is \`failed\``,
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
    ...COMMON_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
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
    ...COMMON_FIELDS_SCHEMA,
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
    revision_source: {
      type: 'keyword',
      _meta: {
        description: `Which surface asked for the revision: ${formatVocabulary(
          REVISION_SOURCES
        )} (http_api: the internal proposals revise route; agent: the Agent Builder revise tool; server_api: an in-process server caller, such as the Hunt Worker adding "Also raised by")`,
        optional: false,
      },
    },
  },
};

export const PROPOSALS_PROPOSAL_RETRIED_EVENT: EventTypeOpts<ProposalsProposalRetriedPayload> = {
  eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalRetried,
  schema: {
    ...COMMON_FIELDS_SCHEMA,
    ...PROPOSAL_ID_FIELDS_SCHEMA,
  },
};

export const PROPOSALS_PROPOSAL_RESUME_REJECTED_EVENT: EventTypeOpts<ProposalsProposalResumeRejectedPayload> =
  {
    eventType: PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected,
    schema: {
      ...COMMON_FIELDS_SCHEMA,
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

/** Every proposals event type, in registration order. */
export const PROPOSALS_TELEMETRY_EVENT_TYPES = [
  PROPOSALS_PROPOSAL_CREATED_EVENT,
  PROPOSALS_PROPOSAL_DECIDED_EVENT,
  PROPOSALS_PROPOSAL_STATUS_CHANGED_EVENT,
  PROPOSALS_ACTION_EXECUTED_EVENT,
  PROPOSALS_PROPOSAL_REVISED_EVENT,
  PROPOSALS_PROPOSAL_RETRIED_EVENT,
  PROPOSALS_PROPOSAL_RESUME_REJECTED_EVENT,
] as const;
