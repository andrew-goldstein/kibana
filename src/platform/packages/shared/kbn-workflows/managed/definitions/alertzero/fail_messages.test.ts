/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import {
  ALERTZERO_ACTION_WORKFLOW_IDS,
  ALERTZERO_ATTACK_DISCOVERY_WORKFLOW_IDS,
  ALERTZERO_FORENSICS_WORKFLOW_IDS,
  ALERTZERO_MANAGED_WORKER_WORKFLOW_IDS,
  ALERTZERO_PROPOSAL_WORKFLOW_IDS,
  ALERTZERO_RULE_WORKFLOW_IDS,
  ALERTZERO_WORKER_DETECTION_RULE_COVERAGE_WORKFLOW_ID,
  ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID,
  ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID,
  ALERTZERO_WORKER_FLOOR_ATTACK_DISCOVERY_WORKFLOW_ID,
  ALERTZERO_WORKER_FORENSICS_ENDPOINT_ANALYSIS_WORKFLOW_ID,
  ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID,
} from '.';
import { ALERTZERO_ACTION_CLOSE_ALERTS_FP_WORKFLOW_ID } from './actions/action_close_alerts_false_positive';
import { ALERTZERO_ACTION_ISOLATE_HOST_WORKFLOW_ID } from './actions/defend/action_isolate_host';
import { ALERTZERO_ACTION_KILL_PROCESS_WORKFLOW_ID } from './actions/defend/action_kill_process';
import { ALERTZERO_ACTION_SUSPEND_PROCESS_WORKFLOW_ID } from './actions/defend/action_suspend_process';
import type { ManagedWorkflowDefinition, ManagedWorkflowTemplateValuesById } from '../..';
import { getManagedWorkflowDefinitions } from '../..';

/**
 * The engine ships a failed run's error message as `errorMessage` in its terminal telemetry
 * event, and the run id joins it to the Worker that started the run. So a `workflow.fail`
 * message in any AlertZero managed workflow may interpolate only definition constants
 * (`consts.*`), counts computed with `| size` in a `data.set` step, and the few values listed
 * in NUMERIC_VALUES, STATUS_VALUES and OPAQUE_VALUES, which never carry free text. Anything
 * else, such as a step, input, event, variable or `workflow.*` value, could carry an id, model
 * output, a step error or input text.
 */

interface YamlStep {
  name?: string;
  type?: string;
  with?: Record<string, unknown>;
}

const LIQUID_TAG = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
/** Every dotted reference a Liquid tag reads, such as `steps.x.output.y` or `workflow.spaceId`. */
const REFERENCE = /\b[A-Za-z_]\w*(?:\.\w+)+/g;

const ALERTZERO_WORKFLOW_IDS: readonly string[] = [
  ...ALERTZERO_ACTION_WORKFLOW_IDS,
  ...ALERTZERO_ATTACK_DISCOVERY_WORKFLOW_IDS,
  ...ALERTZERO_FORENSICS_WORKFLOW_IDS,
  ...ALERTZERO_MANAGED_WORKER_WORKFLOW_IDS,
  ...ALERTZERO_PROPOSAL_WORKFLOW_IDS,
  ...ALERTZERO_RULE_WORKFLOW_IDS,
];

/**
 * Values that are always numbers, allowed by name because analysts also see the message as the
 * proposal's error and a count helps them act on it.
 */
const NUMERIC_VALUES: Readonly<Record<string, readonly string[]>> = {
  [ALERTZERO_ACTION_CLOSE_ALERTS_FP_WORKFLOW_ID]: [
    'steps.close_alerts.output.updated',
    'inputs.actionInput.alertIds.size',
  ],
};

/**
 * Values that are always a workflow execution status (`ExecutionStatus`, a closed engine enum),
 * allowed by name because the status is what tells an analyst how the child run ended.
 */
const STATUS_VALUES: Readonly<Record<string, readonly string[]>> = {
  [ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID]: ['steps.start_fp_review.output.status'],
};

/**
 * The response actions may also name the Endpoint action (a random UUID, which analysts need to
 * find it in the response actions history) and the privilege probe's HTTP status (at most 8
 * characters). Neither carries free text.
 */
const RESPONSE_ACTION_VALUES = ['steps.poll_status.output.data.id', 'variables.probe_http_status'];

const OPAQUE_VALUES: Readonly<Record<string, readonly string[]>> = {
  [ALERTZERO_ACTION_ISOLATE_HOST_WORKFLOW_ID]: RESPONSE_ACTION_VALUES,
  [ALERTZERO_ACTION_KILL_PROCESS_WORKFLOW_ID]: RESPONSE_ACTION_VALUES,
  [ALERTZERO_ACTION_SUSPEND_PROCESS_WORKFLOW_ID]: RESPONSE_ACTION_VALUES,
};

/** Any valid values will do: the fail messages do not depend on the Worker settings. */
const workerTemplateValues: Partial<ManagedWorkflowTemplateValuesById> = {
  [ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
    extras: { autoCloseConfidenceScoreMinThreshold: 0.85 },
  },
  [ALERTZERO_WORKER_FLOOR_ATTACK_DISCOVERY_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
    scheduleInterval: '24h',
  },
  [ALERTZERO_WORKER_FORENSICS_ENDPOINT_ANALYSIS_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
  },
  [ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
    scheduleInterval: '4h',
  },
  [ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
    scheduleInterval: '2h',
    extras: { analysisWindowDays: 7, fpCountThreshold: 10, fpRateThresholdPct: 50 },
  },
  [ALERTZERO_WORKER_DETECTION_RULE_COVERAGE_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
    scheduleInterval: '1h',
    extras: { lookbackDays: 14, maxGapsPerRun: 5 },
  },
};

const renderYaml = (definition: ManagedWorkflowDefinition): string => {
  if (typeof definition.yaml === 'string') return definition.yaml;
  const values = (workerTemplateValues as Record<string, unknown>)[definition.id];
  if (!values || !definition.yamlTemplate) {
    throw new Error(`No template values for ${definition.id}; add them to workerTemplateValues`);
  }
  return definition.yamlTemplate(values as never);
};

/** Every step-shaped object in the parsed definition, at any depth. */
const allSteps = (node: unknown): YamlStep[] => {
  if (Array.isArray(node)) return node.flatMap(allSteps);
  if (node === null || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  const self = typeof record.type === 'string' ? [record as YamlStep] : [];
  return [...self, ...Object.values(record).flatMap(allSteps)];
};

const isCount = (steps: YamlStep[], value: string): boolean => {
  const [, stepName = '', field = ''] = /^steps\.(\w+)\.output\.(\w+)$/.exec(value) ?? [];
  const source = steps.find((step) => step.name === stepName);
  return source?.type === 'data.set' && /\|\s*size\s*\}\}$/.test(String(source.with?.[field]));
};

const interpolatedValues = (message: string): string[] =>
  (message.match(LIQUID_TAG) ?? []).flatMap((tag) => tag.match(REFERENCE) ?? []);

/** Only constants, `| size` counts and the values named above may be interpolated: an allowlist, not a denylist. */
const isAllowed = (id: string, steps: YamlStep[], value: string): boolean =>
  value.startsWith('consts.') ||
  isCount(steps, value) ||
  (NUMERIC_VALUES[id] ?? []).includes(value) ||
  (STATUS_VALUES[id] ?? []).includes(value) ||
  (OPAQUE_VALUES[id] ?? []).includes(value);

const definitions = getManagedWorkflowDefinitions()
  .filter(({ id }) => ALERTZERO_WORKFLOW_IDS.includes(id))
  .map((definition): [string, YamlStep[]] => [
    definition.id,
    allSteps(parse(renderYaml(definition))),
  ]);

describe('AlertZero managed workflow fail messages', () => {
  it('scans every AlertZero managed workflow definition', () => {
    expect(definitions.map(([id]) => id).sort()).toEqual([...ALERTZERO_WORKFLOW_IDS].sort());
  });

  it.each(definitions)(
    '%s interpolates nothing but constants and counts into a workflow.fail message',
    (id, steps) => {
      expect(
        steps
          .filter((step) => step.type === 'workflow.fail')
          .filter((step) =>
            interpolatedValues(String(step.with?.message ?? '')).some(
              (value) => !isAllowed(id, steps, value)
            )
          )
          .map((step) => step.name)
      ).toEqual([]);
    }
  );
});
