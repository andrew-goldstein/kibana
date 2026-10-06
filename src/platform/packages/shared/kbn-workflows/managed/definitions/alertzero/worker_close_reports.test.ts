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
  ALERTZERO_ATTACK_DISCOVERY_REVIEW_WORKFLOW,
  ALERTZERO_COVERAGE_REVIEW_WORKFLOW,
  ALERTZERO_FLOOR_ALERT_TRIAGE_REVIEW_WORKFLOW,
  ALERTZERO_HUNT_PACKAGE_REPORT_WORKFLOW,
  ALERTZERO_HUNT_PROPOSAL_GATE_WORKFLOW,
  ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW,
  ALERTZERO_WORKER_DETECTION_RULE_COVERAGE_WORKFLOW_ID,
  ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID,
  ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW,
  ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID,
  ALERTZERO_WORKER_FLOOR_ATTACK_DISCOVERY_WORKFLOW_ID,
  ALERTZERO_WORKER_FORENSICS_ENDPOINT_ANALYSIS_WORKFLOW_ID,
  ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID,
} from '.';
import { ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID } from './constants';
import type { ManagedWorkflowDefinition, ManagedWorkflowTemplateValuesById } from '../..';
import { getManagedWorkflowDefinitions } from '../..';
import { createWorkflowLiquidEngine } from '../../../common/utils';

/**
 * Every Worker that closes its own Investigation reports the close through
 * `alertzero.reportWorkerOutcome`, right after the `ai.conversation.metadata.patch` step that
 * writes `status: closed`, and only when that patch changed `status`. The Alert Triage and Hunt
 * Workers' closes are wired in their own changes, so they are listed in `CLOSES_REPORTED_LATER`
 * until then.
 */

interface YamlStep {
  name: string;
  type?: string;
  if?: string;
  timeout?: string;
  with?: Record<string, unknown>;
  steps?: YamlStep[];
  else?: YamlStep[];
  cases?: Array<{ steps: YamlStep[] }>;
  default?: YamlStep[];
  'on-failure'?: { continue?: boolean; fallback?: YamlStep[] };
}

const REPORT_STEP_TYPE = 'alertzero.reportWorkerOutcome';
const CLOSE_EVENT = 'worker_investigation_closed';

/** Any valid values will do: where a Worker closes its Investigation does not depend on them. */
const WORKER_TEMPLATE_VALUES: Partial<ManagedWorkflowTemplateValuesById> = {
  [ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    extras: { autoCloseConfidenceScoreMinThreshold: 0.85 },
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_FLOOR_ATTACK_DISCOVERY_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    scheduleInterval: '24h',
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_FORENSICS_ENDPOINT_ANALYSIS_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_HUNT_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    scheduleInterval: '4h',
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    extras: { analysisWindowDays: 7, fpCountThreshold: 10, fpRateThresholdPct: 50 },
    scheduleInterval: '2h',
    settingsVersion: 1,
  },
  [ALERTZERO_WORKER_DETECTION_RULE_COVERAGE_WORKFLOW_ID]: {
    autonomyLevel: 'manual',
    extras: { lookbackDays: 14, maxGapsPerRun: 5 },
    scheduleInterval: '1h',
    settingsVersion: 1,
  },
};

const renderYaml = (definition: ManagedWorkflowDefinition): string => {
  if (typeof definition.yaml === 'string') {
    return definition.yaml;
  }
  const values = (WORKER_TEMPLATE_VALUES as Record<string, unknown>)[definition.id];
  if (!values || !definition.yamlTemplate) {
    throw new Error(`No template values for ${definition.id}; add them to WORKER_TEMPLATE_VALUES`);
  }
  return definition.yamlTemplate(values as never);
};

/** Every list of sibling steps, at any depth: the top level, branches, switch arms and fallbacks. */
const stepLists = (steps: YamlStep[]): YamlStep[][] => [
  steps,
  ...steps.flatMap((step) => [
    ...stepLists(step.steps ?? []),
    ...stepLists(step.else ?? []),
    ...stepLists(step.default ?? []),
    ...(step.cases ?? []).flatMap(({ steps: caseSteps }) => stepLists(caseSteps)),
    ...stepLists(step['on-failure']?.fallback ?? []),
  ]),
];

const stepsOf = (definition: ManagedWorkflowDefinition): YamlStep[] =>
  (parse(renderYaml(definition)) as { steps: YamlStep[] }).steps;

const isClosePatch = (step: YamlStep): boolean =>
  step.type === 'ai.conversation.metadata.patch' &&
  (step.with?.updates as Record<string, unknown> | undefined)?.status === 'closed';

/** Each close patch with the step that follows it in the same list. */
const closesWithNextStep = (
  steps: YamlStep[]
): Array<{ close: YamlStep; next: YamlStep | undefined }> =>
  stepLists(steps).flatMap((list) =>
    list.flatMap((step, index) =>
      isClosePatch(step) ? [{ close: step, next: list[index + 1] }] : []
    )
  );

const alertZeroDefinitions = getManagedWorkflowDefinitions().filter(
  ({ pluginId }) => pluginId === ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID
);

const liquid = createWorkflowLiquidEngine({ strictFilters: true, strictVariables: false });

const evalGuard = (guard: string | undefined, context: Record<string, unknown>): unknown =>
  guard ? liquid.evalValueSync(guard.trim().slice(3, -2).trim(), context) : true;

/**
 * Each Worker close and the reason it reports. A Worker that writes a close reason reports that
 * reason. One that writes none reports `other`. The Rule Coverage review computes its reason, so
 * its report reads it back from the close's output.
 */
const EXPECTED_CLOSE_REPORTS: Array<{
  closeReason: string;
  closeStep: string;
  definition: ManagedWorkflowDefinition;
  reportStep: string;
}> = [
  {
    closeReason: 'false_positive',
    closeStep: 'close_investigation_false_positive',
    definition: ALERTZERO_ATTACK_DISCOVERY_REVIEW_WORKFLOW,
    reportStep: 'report_investigation_closed_false_positive',
  },
  {
    closeReason: 'other',
    closeStep: 'close_investigation_declined',
    definition: ALERTZERO_ATTACK_DISCOVERY_REVIEW_WORKFLOW,
    reportStep: 'report_investigation_closed_declined',
  },
  {
    closeReason: 'other',
    closeStep: 'close_investigation_declined',
    definition: ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW,
    reportStep: 'report_investigation_closed_declined',
  },
  {
    closeReason: 'resolved',
    closeStep: 'close_investigation_applied',
    definition: ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW,
    reportStep: 'report_investigation_closed_applied',
  },
  {
    closeReason: 'other',
    closeStep: 'close_investigation_dismissed',
    definition: ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW,
    reportStep: 'report_investigation_closed_dismissed',
  },
  {
    closeReason: '{{ steps.close_investigation_resolved.output.metadata.close_reason }}',
    closeStep: 'close_investigation_resolved',
    definition: ALERTZERO_COVERAGE_REVIEW_WORKFLOW,
    reportStep: 'report_investigation_closed_resolved',
  },
  {
    closeReason: 'other',
    closeStep: 'close_investigation_dismissed',
    definition: ALERTZERO_COVERAGE_REVIEW_WORKFLOW,
    reportStep: 'report_investigation_closed_dismissed',
  },
  {
    closeReason: 'other',
    closeStep: 'close_investigation_declined',
    definition: ALERTZERO_COVERAGE_REVIEW_WORKFLOW,
    reportStep: 'report_investigation_closed_declined',
  },
];

/** Closes whose Worker reports them in its own, later change. */
const CLOSES_REPORTED_LATER: Array<{ closeStep: string; definition: ManagedWorkflowDefinition }> = [
  {
    closeStep: 'close_investigation_review_limit',
    definition: ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW,
  },
  { closeStep: 'close_no_fp', definition: ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW },
  {
    closeStep: 'close_investigation_after_approval',
    definition: ALERTZERO_FLOOR_ALERT_TRIAGE_REVIEW_WORKFLOW,
  },
  {
    closeStep: 'close_investigation_after_dismissal',
    definition: ALERTZERO_FLOOR_ALERT_TRIAGE_REVIEW_WORKFLOW,
  },
  {
    closeStep: 'close_investigation_after_expiry',
    definition: ALERTZERO_FLOOR_ALERT_TRIAGE_REVIEW_WORKFLOW,
  },
  {
    closeStep: 'dismiss_investigation_if_clean',
    definition: ALERTZERO_HUNT_PACKAGE_REPORT_WORKFLOW,
  },
  { closeStep: 'close_if_settled', definition: ALERTZERO_HUNT_PROPOSAL_GATE_WORKFLOW },
];

const closeLabel = ({
  closeStep,
  definition,
}: {
  closeStep: string;
  definition: ManagedWorkflowDefinition;
}): string => `${definition.id}: ${closeStep}`;

const findClose = (definition: ManagedWorkflowDefinition, closeStep: string) =>
  closesWithNextStep(stepsOf(definition)).find(({ close }) => close.name === closeStep);

describe('Worker Investigation close reports', () => {
  it('follows every AlertZero close patch with a close report', () => {
    const later = CLOSES_REPORTED_LATER.map(closeLabel);
    const unreported = alertZeroDefinitions.flatMap((definition) =>
      closesWithNextStep(stepsOf(definition))
        .filter(({ next }) => next?.type !== REPORT_STEP_TYPE || next.with?.event !== CLOSE_EVENT)
        .map(({ close }) => `${definition.id}: ${close.name}`)
        .filter((label) => !later.includes(label))
    );

    expect(unreported).toEqual([]);
  });

  it('lists every close the sweep finds', () => {
    const found = alertZeroDefinitions.flatMap((definition) =>
      closesWithNextStep(stepsOf(definition)).map(({ close }) => `${definition.id}: ${close.name}`)
    );

    expect(found.sort()).toEqual(
      [...EXPECTED_CLOSE_REPORTS, ...CLOSES_REPORTED_LATER].map(closeLabel).sort()
    );
  });

  describe.each(EXPECTED_CLOSE_REPORTS)(
    '$definition.id $reportStep',
    ({ closeReason, closeStep, definition, reportStep }) => {
      const found = findClose(definition, closeStep);
      const report = found?.next;

      it('directly follows its close', () => {
        expect(report?.name).toBe(reportStep);
      });

      it('never fails the run', () => {
        expect({
          continue: report?.['on-failure']?.continue,
          timeout: report?.timeout,
        }).toEqual({ continue: true, timeout: '30s' });
      });

      it('reports the closed Investigation with the mapped reason', () => {
        expect(report?.with).toEqual({
          close_reason: closeReason,
          event: CLOSE_EVENT,
          investigation_id: found?.close.with?.conversation_id,
        });
      });

      it('reports the reason the close writes, or `other` when it writes none', () => {
        const written = (found?.close.with?.updates as Record<string, unknown> | undefined)
          ?.close_reason;
        const isReadBack = closeReason.includes(`steps.${closeStep}.output.metadata.close_reason`);

        expect(isReadBack || closeReason === (written ?? 'other')).toBe(true);
      });

      const closeOutput = (changedFields: string[]) => ({
        changed_fields: changedFields,
        metadata: { close_reason: 'resolved', status: 'closed' },
      });
      // Satisfies every extra condition a report shares with its close.
      const gates = {
        record_decision: { output: { declined: true } },
        record_proposal_action_decision: { output: { approved: true, dismissed: true } },
      };

      it.each([
        ['the close changed status', { output: closeOutput(['status', 'close_reason']) }, true],
        ['the Investigation was already closed', { output: closeOutput([]) }, false],
        ['the close only changed another field', { output: closeOutput(['summary']) }, false],
        ['the close failed', { error: { message: 'boom' } }, false],
      ])('runs only when %s', (_label, closeResult, expected) => {
        expect(
          evalGuard(report?.if, { steps: { ...gates, [closeStep]: closeResult } }) === true
        ).toBe(expected);
      });

      it('does not run when the close was skipped', () => {
        expect(evalGuard(report?.if, { steps: gates }) === true).toBe(false);
      });
    }
  );

  describe('managed versions', () => {
    it.each([
      [ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW.id, ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW.version, 29],
      [ALERTZERO_COVERAGE_REVIEW_WORKFLOW.id, ALERTZERO_COVERAGE_REVIEW_WORKFLOW.version, 7],
    ])('bumps %s to the version that carries its close reports', (_id, version, expected) => {
      expect(version).toBe(expected);
    });
  });
});
