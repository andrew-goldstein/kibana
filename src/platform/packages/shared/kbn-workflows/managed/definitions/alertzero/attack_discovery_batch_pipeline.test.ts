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
  ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW,
  ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW_ID,
  ALERTZERO_ATTACK_DISCOVERY_WORKFLOW_IDS,
} from '.';
import { buildFieldsZodValidator } from '../../../spec/lib/build_fields_zod_validator';
import { getInputsFromDefinition } from '../../../spec/lib/field_conversion';
import { WorkflowSchema, type WorkflowYaml } from '../../../spec/schema';
import {
  ATTACK_DISCOVERY_ALERT_RETRIEVAL_WORKFLOW,
  ATTACK_DISCOVERY_GENERATION_WORKFLOW,
  ATTACK_DISCOVERY_VALIDATE_WORKFLOW,
} from '../discoveries';

interface ParsedStep {
  name: string;
  type: string;
  else?: ParsedStep[];
  steps?: ParsedStep[];
  timeout?: string;
  with?: Record<string, unknown>;
}

interface ParsedWorkflow {
  settings?: { 'on-failure'?: { fallback?: ParsedStep[] } };
  steps?: ParsedStep[];
  triggers?: Array<{
    inputs?: { properties?: Record<string, unknown>; required?: string[] };
    type?: string;
  }>;
}

const TRACK_GENERATION_STEP_TYPE = 'security.attack-discovery.trackGeneration';

/** Mirrors the ALERTZERO_*_INFERENCE_FEATURE_IDs; @kbn/alertzero-common is not a dependency here. */
const ALERTZERO_TIER_IDS = new Set([
  'alertzero_balanced',
  'alertzero_efficient',
  'alertzero_frontier',
]);

/** The branch-timeout batched generation gives each batch's run of this pipeline, in minutes. */
const BRANCH_TIMEOUT_MINUTES = 30;

const pipeline = parse(ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW.yaml) as ParsedWorkflow;

const flattenSteps = (steps: ParsedStep[] = []): ParsedStep[] =>
  steps.flatMap((step) => [step, ...flattenSteps(step.steps), ...flattenSteps(step.else)]);

const allSteps = flattenSteps(pipeline.steps);
const childCalls = allSteps.filter(({ type }) => type === 'workflow.execute');
const trackSteps = [
  ...allSteps,
  ...flattenSteps(pipeline.settings?.['on-failure']?.fallback),
].filter(({ type }) => type === TRACK_GENERATION_STEP_TYPE);

const getChildInputs = (step: ParsedStep): Record<string, unknown> =>
  (step.with?.inputs ?? {}) as Record<string, unknown>;

const getTriggerInputs = (yaml: string) =>
  (parse(yaml) as ParsedWorkflow).triggers?.find(({ type }) => type === 'manual')?.inputs ?? {};

const toMinutes = (timeout: string | undefined): number =>
  Number(/^(\d+)m$/.exec(timeout ?? '')?.[1] ?? Number.NaN);

describe('ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW', () => {
  it('uses the expected workflow id', () => {
    expect(ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW.id).toBe(
      ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW_ID
    );
  });

  it('is installed with the rest of the Attack Discovery worker chain', () => {
    expect(ALERTZERO_ATTACK_DISCOVERY_WORKFLOW_IDS).toContain(
      ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW_ID
    );
  });

  // Managed install only runs lightweight validation, so an authoring error would
  // otherwise surface at execution time rather than in CI.
  it('passes strict workflow schema validation', () => {
    const result = WorkflowSchema.safeParse(pipeline);

    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('runs the default alert retrieval, generation and validation workflows as the Worker', () => {
    expect(
      childCalls.map((step) => ({
        runAsMode: step.with?.['run-as-mode'],
        workflowId: step.with?.['workflow-id'],
      }))
    ).toEqual([
      { runAsMode: 'inherit', workflowId: ATTACK_DISCOVERY_ALERT_RETRIEVAL_WORKFLOW.id },
      { runAsMode: 'inherit', workflowId: ATTACK_DISCOVERY_GENERATION_WORKFLOW.id },
      { runAsMode: 'inherit', workflowId: ATTACK_DISCOVERY_VALIDATE_WORKFLOW.id },
    ]);
  });

  // A drifted input would fail the child at runtime, when it validates its inputs.
  describe.each([
    ['alert retrieval', ATTACK_DISCOVERY_ALERT_RETRIEVAL_WORKFLOW],
    ['generation', ATTACK_DISCOVERY_GENERATION_WORKFLOW],
    ['validation', ATTACK_DISCOVERY_VALIDATE_WORKFLOW],
  ])('the %s workflow contract', (_name, child) => {
    const call = childCalls.find((step) => step.with?.['workflow-id'] === child.id);
    const { properties = {}, required = [] } = getTriggerInputs(child.yaml);

    it('is called', () => {
      expect(call).toBeDefined();
    });

    it('declares every input the pipeline passes', () => {
      const passed = Object.keys(call != null ? getChildInputs(call) : {});

      expect(passed.filter((input) => !(input in properties))).toEqual([]);
    });

    it('is passed every input it requires', () => {
      const passed = call != null ? getChildInputs(call) : {};

      expect(required.filter((input) => !(input in passed))).toEqual([]);
    });
  });

  // `workflow.execute` hands back a child's `workflow.output` as one object. Without
  // one, a child whose last step has a step `timeout` returns a list instead, and
  // every field read below silently renders empty.
  describe.each([
    ['retrieve_alerts', ATTACK_DISCOVERY_ALERT_RETRIEVAL_WORKFLOW],
    ['generate_discoveries', ATTACK_DISCOVERY_GENERATION_WORKFLOW],
  ])('the fields the pipeline reads from %s', (stepName, child) => {
    const read = [
      ...ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW.yaml.matchAll(
        new RegExp(`steps\\.${stepName}\\.output\\.([a-z_]+)`, 'g')
      ),
    ].map(([, field]) => field);
    const emitted = Object.keys(
      flattenSteps((parse(child.yaml) as ParsedWorkflow).steps).find(
        ({ type }) => type === 'workflow.output'
      )?.with ?? {}
    );

    it('are read', () => {
      expect(read.length).toBeGreaterThan(0);
    });

    it("are all in the child's workflow.output", () => {
      expect([...new Set(read)].filter((field) => !emitted.includes(field))).toEqual([]);
    });
  });

  // Fallbacks run after step errors, not after a workflow timeout. A child's step
  // timeout fails the `workflow.execute` step that called it, so the children's
  // timeouts must all fit inside the batch's deadline.
  it('times out every phase inside the children before batched generation cancels the batch', () => {
    const minutes = [
      ATTACK_DISCOVERY_ALERT_RETRIEVAL_WORKFLOW,
      ATTACK_DISCOVERY_GENERATION_WORKFLOW,
      ATTACK_DISCOVERY_VALIDATE_WORKFLOW,
    ].map((child) =>
      flattenSteps((parse(child.yaml) as ParsedWorkflow).steps)
        .filter(({ timeout }) => timeout != null)
        .reduce((total, { timeout }) => total + toMinutes(timeout), 0)
    );

    expect(minutes.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(minutes.reduce((total, value) => total + value, 0)).toBeLessThan(BRANCH_TIMEOUT_MINUTES);
  });

  // The `workflow.execute` step schema doesn't declare `timeout`, so the workflow
  // editor reports one as a schema violation.
  it('does not put a timeout on a workflow.execute step', () => {
    expect(childCalls.filter(({ timeout }) => timeout != null).map(({ name }) => name)).toEqual([]);
  });

  it('records the generation at every phase, and on failure', () => {
    expect(trackSteps.map((step) => step.with?.phase)).toEqual([
      'started',
      'retrieval_completed',
      'generation_completed',
      'succeeded',
      'failed',
    ]);
  });

  // `succeeded` reports them in its telemetry, and falls back to defaults when they
  // are absent.
  it.each(['alert_retrieval_mode', 'size'])(
    'passes the same %s to the started and succeeded phases',
    (input) => {
      const [started, succeeded] = ['started', 'succeeded'].map(
        (phase) => trackSteps.find((step) => step.with?.phase === phase)?.with?.[input]
      );

      expect(started).toBeDefined();
      expect(succeeded).toEqual(started);
    }
  );

  // An unregistered tier id resolves to the deployment default at runtime exactly
  // as an absent one does, so the guard accepts only the AlertZero tiers.
  it('resolves its model through an AlertZero inference tier', () => {
    const started = trackSteps.find((step) => step.with?.phase === 'started');

    expect(ALERTZERO_TIER_IDS.has(started?.with?.feature_id as string)).toBe(true);
  });

  // The persist step derives the producer from the inherited identity; a value
  // passed here would be rejected.
  it('does not pass a generation_source to the validation workflow', () => {
    const validate = childCalls.find(
      (step) => step.with?.['workflow-id'] === ATTACK_DISCOVERY_VALIDATE_WORKFLOW.id
    );

    expect(validate != null ? getChildInputs(validate) : {}).not.toHaveProperty(
      'generation_source'
    );
  });

  // Bounded so a caller cannot hand the pipeline an arbitrarily large input. The
  // engine validates every run's inputs against these, including runs started by
  // `workflow.execute`.
  describe('input bounds', () => {
    const validator = buildFieldsZodValidator(
      getInputsFromDefinition(pipeline as unknown as Partial<WorkflowYaml>)
    );
    // A Security alert's `_id` is a 64-character hex digest.
    const id = 'a'.repeat(64);
    const ids = Array.from({ length: 1000 }, () => id).join('", "');
    const largestBatchQuery = [
      'FROM .alerts-security.alerts-default METADATA _id',
      `  | WHERE kibana.alert.uuid IN ("${ids}")`,
      `  | WHERE _id IN ("${ids}")`,
      '  | SORT @timestamp ASC',
      '  | LIMIT 1000',
    ].join('\n');

    it('accepts the query for the largest batch', () => {
      expect(validator.safeParse({ esql_query: largestBatchQuery }).success).toBe(true);
    });

    it('rejects an esql_query above its bound', () => {
      expect(validator.safeParse({ esql_query: 'x'.repeat(200_001) }).success).toBe(false);
    });

    it('rejects a connector_id above its bound', () => {
      expect(
        validator.safeParse({ connector_id: 'x'.repeat(1025), esql_query: 'FROM x' }).success
      ).toBe(false);
    });

    it('accepts a connector_id at its bound', () => {
      expect(
        validator.safeParse({ connector_id: 'x'.repeat(1024), esql_query: 'FROM x' }).success
      ).toBe(true);
    });
  });
});
