/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EventTypeOpts } from '@kbn/core/server';
import type { DismissReason } from '@kbn/proposals-common';
import { dismissReasonSchema } from '@kbn/proposals-common';
import type { EscalationVisibility } from '../../common/escalations/escalation';
import { escalationVisibilitySchema } from '../../common/escalations/escalation';
import type { InvestigationClosedByClass, InvestigationCloseReason } from './constants';
import {
  AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS,
  INVESTIGATION_CLOSE_REASONS,
  INVESTIGATION_CLOSED_BY_CLASSES,
} from './constants';
import { formatVocabulary } from './format_vocabulary';

export interface AgenticInvestigationsInvestigationClosedPayload {
  close_reason?: InvestigationCloseReason;
  closed_by_class: InvestigationClosedByClass;
  dismiss_reason?: DismissReason;
  investigation_id: string;
  is_default_space: boolean;
  proposals_open_at_close: number;
  time_open_ms?: number;
}

export interface AgenticInvestigationsInvestigationReopenedPayload {
  investigation_id: string;
  is_default_space: boolean;
}

export interface AgenticInvestigationsEscalationCreatedPayload {
  access_mode: EscalationVisibility;
  escalation_id: string;
  investigation_id: string;
  is_default_space: boolean;
  linked_investigations_at_create: number;
  participant_count: number;
}

export interface AgenticInvestigationsEscalationInvestigationLinkedPayload {
  escalation_id: string;
  investigation_id: string;
  is_default_space: boolean;
  linked_investigation_count: number;
}

export interface AgenticInvestigationsEscalationClosedPayload {
  escalation_id: string;
  investigations_closed: number;
  is_default_space: boolean;
  linked_investigation_count: number;
  time_open_ms?: number;
}

/** The payload each agentic_investigations event type carries. */
export interface AgenticInvestigationsTelemetryEventPayloads {
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed]: AgenticInvestigationsInvestigationClosedPayload;
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened]: AgenticInvestigationsInvestigationReopenedPayload;
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationCreated]: AgenticInvestigationsEscalationCreatedPayload;
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationInvestigationLinked]: AgenticInvestigationsEscalationInvestigationLinkedPayload;
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed]: AgenticInvestigationsEscalationClosedPayload;
}

/** One event ready to report: its type and the matching payload. */
export type AgenticInvestigationsTelemetryEvent = {
  [K in keyof AgenticInvestigationsTelemetryEventPayloads]: {
    eventType: K;
    payload: AgenticInvestigationsTelemetryEventPayloads[K];
  };
}[keyof AgenticInvestigationsTelemetryEventPayloads];

const INVESTIGATION_ID_DESCRIPTION =
  "The Investigation's Agent Builder conversation id. Agent Builder generates a random UUID, but the caller creating the conversation may supply its own UUID, including a deterministic one derived from one of its own record ids, so it is a stable id that can name a customer record (never a person). The same value ships as Agent Builder's conversation_id";
const ESCALATION_ID_DESCRIPTION =
  'Generated UUID of the escalation (the Agent Builder conversation id)';
const IS_DEFAULT_SPACE_DESCRIPTION =
  'Whether the event happened in the default space. The space id itself is never sent';
const TIME_OPEN_MS_DESCRIPTION =
  'Milliseconds from creation to this close (not from a later reopen); absent when the creation time cannot be read';
const LINKED_INVESTIGATION_COUNT_DESCRIPTION =
  'Number of investigations linked to the escalation after this write';
const API_SCOPE_DESCRIPTION =
  'through the Agentic Investigations API. Writes that bypass this plugin, such as workflow steps, send nothing';

export const AGENTIC_INVESTIGATIONS_INVESTIGATION_CLOSED_EVENT: EventTypeOpts<AgenticInvestigationsInvestigationClosedPayload> =
  {
    eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed,
    schema: {
      close_reason: {
        type: 'keyword',
        _meta: {
          description: `Close reason stored on the Investigation, from the template SELECT (${formatVocabulary(
            INVESTIGATION_CLOSE_REASONS
          )}); absent when unset or outside that vocabulary`,
          optional: true,
        },
      },
      closed_by_class: {
        type: 'keyword',
        _meta: {
          description: `How the Investigation was closed: ${formatVocabulary(
            INVESTIGATION_CLOSED_BY_CLASSES
          )}. \`direct\` is a close requested directly through this plugin's status API or service (by a person in the UI, an API key or automation); \`escalation_cascade\` is the close of a linked escalation. Sent only for closes made ${API_SCOPE_DESCRIPTION}`,
          optional: false,
        },
      },
      dismiss_reason: {
        type: 'keyword',
        _meta: {
          description: `Reason applied to the pending proposals the close dismissed (${formatVocabulary(
            dismissReasonSchema.options
          )}); absent when the close dismissed no proposal (none was pending, or every pending one was already decided or expired)`,
          optional: true,
        },
      },
      investigation_id: {
        type: 'keyword',
        _meta: { description: INVESTIGATION_ID_DESCRIPTION, optional: false },
      },
      is_default_space: {
        type: 'boolean',
        _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
      },
      proposals_open_at_close: {
        type: 'long',
        _meta: {
          description:
            'Number of proposals still pending when this close attempt was requested (the close dismisses them); 0 without the proposals plugin. Counted per attempt: when a close is retried after some proposals could not be dismissed, the retry counts only the proposals that remain',
          optional: false,
        },
      },
      time_open_ms: {
        type: 'long',
        _meta: { description: TIME_OPEN_MS_DESCRIPTION, optional: true },
      },
    },
  };

export const AGENTIC_INVESTIGATIONS_INVESTIGATION_REOPENED_EVENT: EventTypeOpts<AgenticInvestigationsInvestigationReopenedPayload> =
  {
    eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened,
    schema: {
      investigation_id: {
        type: 'keyword',
        _meta: {
          description: `${INVESTIGATION_ID_DESCRIPTION}. Sent only for reopens made ${API_SCOPE_DESCRIPTION}`,
          optional: false,
        },
      },
      is_default_space: {
        type: 'boolean',
        _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
      },
    },
  };

export const AGENTIC_INVESTIGATIONS_ESCALATION_CREATED_EVENT: EventTypeOpts<AgenticInvestigationsEscalationCreatedPayload> =
  {
    eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationCreated,
    schema: {
      access_mode: {
        type: 'keyword',
        _meta: {
          description: `Escalation visibility: ${formatVocabulary(
            escalationVisibilitySchema.options
          )}`,
          optional: false,
        },
      },
      escalation_id: {
        type: 'keyword',
        _meta: {
          description: `${ESCALATION_ID_DESCRIPTION}. Sent only for escalations created ${API_SCOPE_DESCRIPTION}`,
          optional: false,
        },
      },
      investigation_id: {
        type: 'keyword',
        _meta: {
          description: `The Investigation the escalation was opened from. ${INVESTIGATION_ID_DESCRIPTION}`,
          optional: false,
        },
      },
      is_default_space: {
        type: 'boolean',
        _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
      },
      linked_investigations_at_create: {
        type: 'long',
        _meta: {
          description: 'Number of investigations linked when the escalation was created',
          optional: false,
        },
      },
      participant_count: {
        type: 'long',
        _meta: {
          description:
            'Number of distinct users assigned at creation. A private escalation grants access to exactly these users. Excludes the creator unless listed',
          optional: false,
        },
      },
    },
  };

export const AGENTIC_INVESTIGATIONS_ESCALATION_INVESTIGATION_LINKED_EVENT: EventTypeOpts<AgenticInvestigationsEscalationInvestigationLinkedPayload> =
  {
    eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationInvestigationLinked,
    schema: {
      escalation_id: {
        type: 'keyword',
        _meta: {
          description: `${ESCALATION_ID_DESCRIPTION}. Sent only for links made ${API_SCOPE_DESCRIPTION}`,
          optional: false,
        },
      },
      investigation_id: {
        type: 'keyword',
        _meta: {
          description: `The newly linked Investigation. ${INVESTIGATION_ID_DESCRIPTION}`,
          optional: false,
        },
      },
      is_default_space: {
        type: 'boolean',
        _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
      },
      linked_investigation_count: {
        type: 'long',
        _meta: { description: LINKED_INVESTIGATION_COUNT_DESCRIPTION, optional: false },
      },
    },
  };

export const AGENTIC_INVESTIGATIONS_ESCALATION_CLOSED_EVENT: EventTypeOpts<AgenticInvestigationsEscalationClosedPayload> =
  {
    eventType: AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed,
    schema: {
      escalation_id: {
        type: 'keyword',
        _meta: {
          description: `${ESCALATION_ID_DESCRIPTION}. Sent only for closes made ${API_SCOPE_DESCRIPTION}`,
          optional: false,
        },
      },
      investigations_closed: {
        type: 'long',
        _meta: {
          description:
            'Number of linked investigations this close attempt closed (each also sends a `closed_by_class: escalation_cascade` close). Counted per attempt: when a close is retried after an incomplete cascade, it counts only the investigations the retry closed',
          optional: false,
        },
      },
      is_default_space: {
        type: 'boolean',
        _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
      },
      linked_investigation_count: {
        type: 'long',
        _meta: {
          description: 'Number of investigations linked to the escalation when it closed',
          optional: false,
        },
      },
      time_open_ms: {
        type: 'long',
        _meta: { description: TIME_OPEN_MS_DESCRIPTION, optional: true },
      },
    },
  };

/** Every agentic_investigations event type, in registration order. */
export const AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES = [
  AGENTIC_INVESTIGATIONS_INVESTIGATION_CLOSED_EVENT,
  AGENTIC_INVESTIGATIONS_INVESTIGATION_REOPENED_EVENT,
  AGENTIC_INVESTIGATIONS_ESCALATION_CREATED_EVENT,
  AGENTIC_INVESTIGATIONS_ESCALATION_INVESTIGATION_LINKED_EVENT,
  AGENTIC_INVESTIGATIONS_ESCALATION_CLOSED_EVENT,
] as const;
