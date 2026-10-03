/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EventTypeOpts, RootSchema } from '@kbn/core/server';
import { WATCH_AUTONOMY_LEVELS } from '@kbn/alertzero-common';
import type {
  AdWorkerAnalysisVerdict,
  AdWorkerHandoffOutcome,
  AdWorkerRunOutcome,
} from '../../common/telemetry/constants';
import {
  AD_WORKER_ANALYSIS_VERDICTS,
  AD_WORKER_HANDOFF_OUTCOMES,
  AD_WORKER_RUN_OUTCOMES,
} from '../../common/telemetry/constants';
import type {
  AlertZeroAutonomyLevel,
  AlertZeroAutonomyMode,
  AlertZeroInvestigationActorClass,
  AlertZeroInvestigationCloseReason,
  AlertZeroInvestigationSeverity,
  AlertZeroScheduleIntervalBucket,
  AlertZeroTriggerType,
  AlertZeroWatchTag,
  AlertZeroWorkerEnabledValue,
  AlertZeroWorkerId,
  AlertZeroWorkerSetting,
} from './constants';
import {
  ALERTZERO_TELEMETRY_EVENTS,
  INVESTIGATION_CLOSE_REASONS,
  INVESTIGATION_SEVERITIES,
  SCHEDULE_INTERVAL_BUCKETS,
  WORKER_ENABLED_VALUES,
  WORKER_SETTINGS,
} from './constants';
import { formatVocabulary } from './format_vocabulary';

/** The fields every AlertZero Worker run event carries, built by `buildAlertZeroEnvelope`. */
export interface AlertZeroEnvelope {
  autonomy_level?: AlertZeroAutonomyLevel;
  autonomy_mode?: AlertZeroAutonomyMode;
  execution_id: string;
  is_default_space: boolean;
  run_id: string;
  trigger_type: AlertZeroTriggerType;
  watch_tag: AlertZeroWatchTag;
  worker_id: AlertZeroWorkerId;
}

export interface AlertZeroAdWorkerRunCompletedPayload extends AlertZeroEnvelope {
  alerts_analyzed: number;
  attacks_generated: number;
  attacks_persisted: number;
  batches_failed: number;
  batches_total: number;
  run_outcome: AdWorkerRunOutcome;
}

export interface AlertZeroAdWorkerReviewStartedPayload extends AlertZeroEnvelope {
  investigation_id?: string;
  is_rereview?: boolean;
}

export interface AlertZeroAdWorkerAnalysisCompletedPayload extends AlertZeroEnvelope {
  analysis_error: boolean;
  verdict: AdWorkerAnalysisVerdict;
}

export interface AlertZeroAdWorkerHandoffResolvedPayload extends AlertZeroEnvelope {
  auto_approve_requested?: boolean;
  outcome: AdWorkerHandoffOutcome;
  verdict?: AdWorkerAnalysisVerdict;
}

export interface AlertZeroWorkerSettingsChangedPayload {
  bulk_write: boolean;
  is_default_space: boolean;
  next_value?:
    | AlertZeroAutonomyLevel
    | AlertZeroScheduleIntervalBucket
    | AlertZeroWorkerEnabledValue;
  previous_value?:
    | AlertZeroAutonomyLevel
    | AlertZeroScheduleIntervalBucket
    | AlertZeroWorkerEnabledValue;
  setting: AlertZeroWorkerSetting;
  settings_revision?: number;
  watch_tag: AlertZeroWatchTag;
  worker_id: AlertZeroWorkerId;
}

export interface AlertZeroWorkerActivatedPayload {
  autonomy_level?: AlertZeroAutonomyLevel;
  enabled: boolean;
  is_default_space: boolean;
  watch_tag: AlertZeroWatchTag;
  worker_id: AlertZeroWorkerId;
}

export interface AlertZeroAutonomySnapshotWorker {
  autonomy_level: AlertZeroAutonomyLevel;
  count: number;
  enabled: boolean;
  worker_id: AlertZeroWorkerId;
}

export interface AlertZeroAutonomySnapshotPayload {
  snapshot_day: string;
  space_count: number;
  workers: AlertZeroAutonomySnapshotWorker[];
}

export interface AlertZeroFeatureFlagsSnapshotFlag {
  enabled_space_count: number;
  flag: string;
}

export interface AlertZeroFeatureFlagsSnapshotPayload {
  flags: AlertZeroFeatureFlagsSnapshotFlag[];
  snapshot_day: string;
  space_count: number;
}

export interface AlertZeroInvestigationCreatedPayload {
  created_by_class: AlertZeroInvestigationActorClass;
  investigation_id: string;
  is_default_space: boolean;
  severity?: AlertZeroInvestigationSeverity;
  worker_id?: AlertZeroWorkerId;
}

export interface AlertZeroInvestigationClosedPayload {
  close_reason?: AlertZeroInvestigationCloseReason;
  closed_by_class: AlertZeroInvestigationActorClass;
  investigation_id: string;
  is_default_space: boolean;
  severity?: AlertZeroInvestigationSeverity;
  worker_id?: AlertZeroWorkerId;
}

export interface AlertZeroInvestigationReopenedPayload {
  investigation_id: string;
  is_default_space: boolean;
  reopened_by_class: AlertZeroInvestigationActorClass;
  worker_id?: AlertZeroWorkerId;
}

/** The payload each AlertZero event type carries. */
export interface AlertZeroTelemetryEventPayloads {
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerRunCompleted]: AlertZeroAdWorkerRunCompletedPayload;
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerReviewStarted]: AlertZeroAdWorkerReviewStartedPayload;
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerAnalysisCompleted]: AlertZeroAdWorkerAnalysisCompletedPayload;
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerHandoffResolved]: AlertZeroAdWorkerHandoffResolvedPayload;
  [ALERTZERO_TELEMETRY_EVENTS.WorkerSettingsChanged]: AlertZeroWorkerSettingsChangedPayload;
  [ALERTZERO_TELEMETRY_EVENTS.WorkerActivated]: AlertZeroWorkerActivatedPayload;
  [ALERTZERO_TELEMETRY_EVENTS.AutonomySnapshot]: AlertZeroAutonomySnapshotPayload;
  [ALERTZERO_TELEMETRY_EVENTS.FeatureFlagsSnapshot]: AlertZeroFeatureFlagsSnapshotPayload;
  [ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated]: AlertZeroInvestigationCreatedPayload;
  [ALERTZERO_TELEMETRY_EVENTS.InvestigationClosed]: AlertZeroInvestigationClosedPayload;
  [ALERTZERO_TELEMETRY_EVENTS.InvestigationReopened]: AlertZeroInvestigationReopenedPayload;
}

const WORKER_ID_DESCRIPTION =
  'Worker catalog id of the managed workflow (for example `system-security-floor-attack-discovery`), or `other` outside the catalog';
const WATCH_TAG_DESCRIPTION =
  'Watch tier tag of the Worker (`watch-floor`, `watch-officer`, `watch-hunt`, `watch-detection` or `watch-forensics`), or `other` outside the catalog';
const AUTONOMY_LEVEL_DESCRIPTION = `Worker autonomy level (${formatVocabulary(
  WATCH_AUTONOMY_LEVELS
)})`;
const IS_DEFAULT_SPACE_DESCRIPTION =
  'Whether the event happened in the default space. The space id itself is never sent';
const INVESTIGATION_ID_DESCRIPTION =
  'Generated UUID of the Investigation (Agent Builder conversation id)';
const INVESTIGATION_ACTOR_CLASS_DESCRIPTION =
  '`worker` (a managed AlertZero Worker, excluding test runs), `custom_workflow`, `agent` (an Agent Builder execution) or `user` (the HTTP or server API)';
const INVESTIGATION_SEVERITY_DESCRIPTION = `Investigation severity (${formatVocabulary(
  INVESTIGATION_SEVERITIES
)}), when set`;
const SNAPSHOT_DAY_DESCRIPTION =
  'UTC day (`YYYY-MM-DD`) the snapshot describes; one snapshot per type per day, used to dedupe catch-up runs';
const SNAPSHOT_SPACE_COUNT_DESCRIPTION = 'Number of spaces the cluster-level aggregate covers';

const ENVELOPE_SCHEMA: RootSchema<AlertZeroEnvelope> = {
  autonomy_level: {
    type: 'keyword',
    _meta: {
      description: `${AUTONOMY_LEVEL_DESCRIPTION}, read from the root execution's persisted definition consts; absent when the root carries none`,
      optional: true,
    },
  },
  autonomy_mode: {
    type: 'keyword',
    _meta: {
      description:
        'Derived from autonomy_level: `auto_accept` when the Worker gate auto-approves (`supervised`), otherwise `gated`; absent with autonomy_level',
      optional: true,
    },
  },
  execution_id: {
    type: 'keyword',
    _meta: {
      description:
        'Generated UUID of the workflow execution that reported the event (the root or one of its descendants)',
      optional: false,
    },
  },
  is_default_space: {
    type: 'boolean',
    _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
  },
  run_id: {
    type: 'keyword',
    _meta: {
      description:
        "Generated UUID of the Worker run's root execution, derived server-side; every event of one run shares it and it joins to the engine's execution events",
      optional: false,
    },
  },
  trigger_type: {
    type: 'keyword',
    _meta: {
      description:
        'How the root execution started, from its persisted `triggeredBy`: `manual`, `scheduled`, `alert`, `workflow_step`, `event`, `other` (a custom provenance value) or `unknown`',
      optional: false,
    },
  },
  watch_tag: {
    type: 'keyword',
    _meta: { description: WATCH_TAG_DESCRIPTION, optional: false },
  },
  worker_id: {
    type: 'keyword',
    _meta: { description: WORKER_ID_DESCRIPTION, optional: false },
  },
};

export const ALERTZERO_AD_WORKER_RUN_COMPLETED_EVENT: EventTypeOpts<AlertZeroAdWorkerRunCompletedPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.AdWorkerRunCompleted,
    schema: {
      ...ENVELOPE_SCHEMA,
      alerts_analyzed: {
        type: 'long',
        _meta: { description: 'Number of alerts sent to generation', optional: false },
      },
      attacks_generated: {
        type: 'long',
        _meta: {
          description: 'Number of attacks the model generated, before deduplication',
          optional: false,
        },
      },
      attacks_persisted: {
        type: 'long',
        _meta: {
          description: 'Number of attacks persisted and dispatched for review',
          optional: false,
        },
      },
      batches_failed: {
        type: 'long',
        _meta: { description: 'Number of generation batches that failed', optional: false },
      },
      batches_total: {
        type: 'long',
        _meta: { description: 'Number of generation batches attempted', optional: false },
      },
      run_outcome: {
        type: 'keyword',
        _meta: {
          description: `How the run ended: ${formatVocabulary(AD_WORKER_RUN_OUTCOMES)}`,
          optional: false,
        },
      },
    },
  };

export const ALERTZERO_AD_WORKER_REVIEW_STARTED_EVENT: EventTypeOpts<AlertZeroAdWorkerReviewStartedPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.AdWorkerReviewStarted,
    schema: {
      ...ENVELOPE_SCHEMA,
      investigation_id: {
        type: 'keyword',
        _meta: {
          description: `${INVESTIGATION_ID_DESCRIPTION} the review opened or reused; joins Investigation events to the run`,
          optional: true,
        },
      },
      is_rereview: {
        type: 'boolean',
        _meta: {
          description: 'Whether the attack already had an Investigation (a re-review)',
          optional: true,
        },
      },
    },
  };

export const ALERTZERO_AD_WORKER_ANALYSIS_COMPLETED_EVENT: EventTypeOpts<AlertZeroAdWorkerAnalysisCompletedPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.AdWorkerAnalysisCompleted,
    schema: {
      ...ENVELOPE_SCHEMA,
      analysis_error: {
        type: 'boolean',
        _meta: {
          description: 'Whether the FP/TP analysis failed or timed out',
          optional: false,
        },
      },
      verdict: {
        type: 'keyword',
        _meta: {
          description: `FP/TP analysis verdict: ${formatVocabulary(AD_WORKER_ANALYSIS_VERDICTS)}`,
          optional: false,
        },
      },
    },
  };

export const ALERTZERO_AD_WORKER_HANDOFF_RESOLVED_EVENT: EventTypeOpts<AlertZeroAdWorkerHandoffResolvedPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.AdWorkerHandoffResolved,
    schema: {
      ...ENVELOPE_SCHEMA,
      auto_approve_requested: {
        type: 'boolean',
        _meta: {
          description: 'Whether the review asked the escalation gate to auto-approve',
          optional: true,
        },
      },
      outcome: {
        type: 'keyword',
        _meta: {
          description: `How the completed escalation gate resolved the forensics handoff: ${formatVocabulary(
            AD_WORKER_HANDOFF_OUTCOMES
          )}`,
          optional: false,
        },
      },
      verdict: {
        type: 'keyword',
        _meta: {
          description:
            'FP/TP analysis verdict that led to the escalation (`true_positive` or `inconclusive`)',
          optional: true,
        },
      },
    },
  };

export const ALERTZERO_WORKER_SETTINGS_CHANGED_EVENT: EventTypeOpts<AlertZeroWorkerSettingsChangedPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.WorkerSettingsChanged,
    schema: {
      bulk_write: {
        type: 'boolean',
        _meta: {
          description:
            'Whether the same Worker write changed more than one setting, counting an enable or disable as one (one event is sent for each)',
          optional: false,
        },
      },
      is_default_space: {
        type: 'boolean',
        _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
      },
      next_value: {
        type: 'keyword',
        _meta: {
          description: `New value, only for enum, bounded or boolean settings: the autonomy level (${formatVocabulary(
            WATCH_AUTONOMY_LEVELS
          )}) for \`autonomy\`, the interval bucket (${formatVocabulary(
            SCHEDULE_INTERVAL_BUCKETS
          )}) for \`schedule_interval\`, or ${formatVocabulary(
            WORKER_ENABLED_VALUES
          )} (strings) for \`enabled\`. Absent for \`extras\` and \`other\``,
          optional: true,
        },
      },
      previous_value: {
        type: 'keyword',
        _meta: {
          description: `Previous value, with the same rules as next_value (${formatVocabulary(
            WORKER_ENABLED_VALUES
          )} for \`enabled\`); the Worker's defaults on its first save`,
          optional: true,
        },
      },
      setting: {
        type: 'keyword',
        _meta: {
          description: `Which setting changed: ${formatVocabulary(
            WORKER_SETTINGS
          )}, where \`enabled\` is an enable or disable of an installed Worker and \`other\` is any settings key outside the allowlist. Values are never sent for \`extras\` or \`other\`. One event per changed setting`,
          optional: false,
        },
      },
      settings_revision: {
        type: 'long',
        _meta: {
          description:
            "Settings revision the write was accepted against (the Worker document's version before the write); absent on a Worker's first save and on an enable or disable that saves no settings",
          optional: true,
        },
      },
      watch_tag: {
        type: 'keyword',
        _meta: { description: WATCH_TAG_DESCRIPTION, optional: false },
      },
      worker_id: {
        type: 'keyword',
        _meta: { description: WORKER_ID_DESCRIPTION, optional: false },
      },
    },
  };

export const ALERTZERO_WORKER_ACTIVATED_EVENT: EventTypeOpts<AlertZeroWorkerActivatedPayload> = {
  eventType: ALERTZERO_TELEMETRY_EVENTS.WorkerActivated,
  schema: {
    autonomy_level: {
      type: 'keyword',
      _meta: {
        description: `${AUTONOMY_LEVEL_DESCRIPTION} the Worker was installed with`,
        optional: true,
      },
    },
    enabled: {
      type: 'boolean',
      _meta: {
        description:
          'Whether the Worker is enabled after the write that installed it (a settings save or a disable installs it disabled)',
        optional: false,
      },
    },
    is_default_space: {
      type: 'boolean',
      _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
    },
    watch_tag: {
      type: 'keyword',
      _meta: { description: WATCH_TAG_DESCRIPTION, optional: false },
    },
    worker_id: {
      type: 'keyword',
      _meta: { description: WORKER_ID_DESCRIPTION, optional: false },
    },
  },
};

export const ALERTZERO_AUTONOMY_SNAPSHOT_EVENT: EventTypeOpts<AlertZeroAutonomySnapshotPayload> = {
  eventType: ALERTZERO_TELEMETRY_EVENTS.AutonomySnapshot,
  schema: {
    snapshot_day: {
      type: 'keyword',
      _meta: { description: SNAPSHOT_DAY_DESCRIPTION, optional: false },
    },
    space_count: {
      type: 'long',
      _meta: { description: SNAPSHOT_SPACE_COUNT_DESCRIPTION, optional: false },
    },
    workers: {
      type: 'array',
      items: {
        properties: {
          autonomy_level: {
            type: 'keyword',
            _meta: { description: AUTONOMY_LEVEL_DESCRIPTION, optional: false },
          },
          count: {
            type: 'long',
            _meta: {
              description: 'Number of spaces with this Worker at this autonomy level and state',
              optional: false,
            },
          },
          enabled: {
            type: 'boolean',
            _meta: { description: 'Whether the installed Worker is enabled', optional: false },
          },
          worker_id: {
            type: 'keyword',
            _meta: { description: WORKER_ID_DESCRIPTION, optional: false },
          },
        },
        _meta: {
          description: 'One count per worker_id, autonomy_level and enabled combination',
        },
      },
      _meta: {
        description: 'Installed Worker counts across the cluster, summed over spaces',
      },
    },
  },
};

export const ALERTZERO_FEATURE_FLAGS_SNAPSHOT_EVENT: EventTypeOpts<AlertZeroFeatureFlagsSnapshotPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.FeatureFlagsSnapshot,
    schema: {
      flags: {
        type: 'array',
        items: {
          properties: {
            enabled_space_count: {
              type: 'long',
              _meta: {
                description: 'Number of spaces where the flag is enabled',
                optional: false,
              },
            },
            flag: {
              type: 'keyword',
              _meta: {
                description:
                  'Allowlisted feature flag or advanced setting id (for example `securitySolution:enableAlertZero`)',
                optional: false,
              },
            },
          },
          _meta: { description: 'Enabled-space count of one allowlisted flag' },
        },
        _meta: { description: 'Per-flag enabled-space counts across the cluster' },
      },
      snapshot_day: {
        type: 'keyword',
        _meta: { description: SNAPSHOT_DAY_DESCRIPTION, optional: false },
      },
      space_count: {
        type: 'long',
        _meta: { description: SNAPSHOT_SPACE_COUNT_DESCRIPTION, optional: false },
      },
    },
  };

export const ALERTZERO_INVESTIGATION_CREATED_EVENT: EventTypeOpts<AlertZeroInvestigationCreatedPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.InvestigationCreated,
    schema: {
      created_by_class: {
        type: 'keyword',
        _meta: {
          description: `Who created the Investigation: ${INVESTIGATION_ACTOR_CLASS_DESCRIPTION}`,
          optional: false,
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
      severity: {
        type: 'keyword',
        _meta: { description: INVESTIGATION_SEVERITY_DESCRIPTION, optional: true },
      },
      worker_id: {
        type: 'keyword',
        _meta: {
          description: `${WORKER_ID_DESCRIPTION}; only when created_by_class is \`worker\``,
          optional: true,
        },
      },
    },
  };

export const ALERTZERO_INVESTIGATION_CLOSED_EVENT: EventTypeOpts<AlertZeroInvestigationClosedPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.InvestigationClosed,
    schema: {
      close_reason: {
        type: 'keyword',
        _meta: {
          description: `Investigation close reason (${formatVocabulary(
            INVESTIGATION_CLOSE_REASONS
          )}), when set`,
          optional: true,
        },
      },
      closed_by_class: {
        type: 'keyword',
        _meta: {
          description: `Who closed the Investigation: ${INVESTIGATION_ACTOR_CLASS_DESCRIPTION}`,
          optional: false,
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
      severity: {
        type: 'keyword',
        _meta: { description: INVESTIGATION_SEVERITY_DESCRIPTION, optional: true },
      },
      worker_id: {
        type: 'keyword',
        _meta: {
          description: `${WORKER_ID_DESCRIPTION}; only when closed_by_class is \`worker\``,
          optional: true,
        },
      },
    },
  };

export const ALERTZERO_INVESTIGATION_REOPENED_EVENT: EventTypeOpts<AlertZeroInvestigationReopenedPayload> =
  {
    eventType: ALERTZERO_TELEMETRY_EVENTS.InvestigationReopened,
    schema: {
      investigation_id: {
        type: 'keyword',
        _meta: { description: INVESTIGATION_ID_DESCRIPTION, optional: false },
      },
      is_default_space: {
        type: 'boolean',
        _meta: { description: IS_DEFAULT_SPACE_DESCRIPTION, optional: false },
      },
      reopened_by_class: {
        type: 'keyword',
        _meta: {
          description: `Who reopened the Investigation: ${INVESTIGATION_ACTOR_CLASS_DESCRIPTION}`,
          optional: false,
        },
      },
      worker_id: {
        type: 'keyword',
        _meta: {
          description: `${WORKER_ID_DESCRIPTION}; only when reopened_by_class is \`worker\``,
          optional: true,
        },
      },
    },
  };

/** Every AlertZero event type, in registration order. */
export const ALERTZERO_TELEMETRY_EVENT_TYPES = [
  ALERTZERO_AD_WORKER_RUN_COMPLETED_EVENT,
  ALERTZERO_AD_WORKER_REVIEW_STARTED_EVENT,
  ALERTZERO_AD_WORKER_ANALYSIS_COMPLETED_EVENT,
  ALERTZERO_AD_WORKER_HANDOFF_RESOLVED_EVENT,
  ALERTZERO_WORKER_SETTINGS_CHANGED_EVENT,
  ALERTZERO_WORKER_ACTIVATED_EVENT,
  ALERTZERO_AUTONOMY_SNAPSHOT_EVENT,
  ALERTZERO_FEATURE_FLAGS_SNAPSHOT_EVENT,
  ALERTZERO_INVESTIGATION_CREATED_EVENT,
  ALERTZERO_INVESTIGATION_CLOSED_EVENT,
  ALERTZERO_INVESTIGATION_REOPENED_EVENT,
] as const;
