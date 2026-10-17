/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { i18n } from '@kbn/i18n';
import type { CommonStepDefinition } from '@kbn/workflows-extensions/common';
import { StepCategory } from '@kbn/workflows';

import { ApiConfigSchema } from './shared_schemas';

/**
 * Step type ID for the Track generation step.
 */
export const TrackGenerationStepTypeId = 'security.attack-discovery.trackGeneration';

/**
 * Input schema for the Track generation step.
 *
 * A workflow that runs the default Attack Discovery workflows as its own children calls this
 * step at each point of the run, so the run appears in the Attack Discovery generations view and
 * its execution details, as a run of the `security.attack-discovery.run` step does.
 */
export const TrackGenerationInputSchema = lazySchema(() =>
  z.object({
    /** Every phase after `started`: the `api_config` the `started` phase returned. */
    api_config: ApiConfigSchema.optional(),
    /** `started` and `succeeded`: how alert retrieval queries alerts (default `custom_query`). */
    alert_retrieval_mode: z.enum(['custom_query', 'esql']).optional(),
    /** `started` only: the connector to use. When empty, `feature_id` and then the default resolve it. */
    connector_id: z.string().max(1024).optional(),
    /** `failed` only: the error, when no child run failed. */
    error_message: z.string().max(10_000).optional(),
    /** Every phase after `started`: the `execution_uuid` the `started` phase returned. */
    execution_uuid: z.string().max(1024).optional(),
    /** `started` only: the Model Management feature whose model the run should use. */
    feature_id: z.string().max(256).optional(),
    phase: z.enum([
      'started',
      'retrieval_completed',
      'generation_completed',
      'succeeded',
      'failed',
      'reconcile',
    ]),
    /**
     * `reconcile` only: whose batch pipeline runs to reconcile, this run's or those of the
     * workflow's previous run when it was cancelled, timed out, or left running.
     */
    scope: z.enum(['previous_run', 'this_run']).optional(),
    /** `started` and `succeeded`: the maximum number of alerts to analyze. Defaults to 100. */
    size: z.number().int().min(1).max(10_000).optional(),
  })
);

/**
 * Output schema for the Track generation step. `api_config` and `connector_name` are only
 * returned by the `started` phase, and `reconciled` only by the `reconcile` phase.
 */
export const TrackGenerationOutputSchema = lazySchema(() =>
  z.object({
    api_config: ApiConfigSchema.optional(),
    connector_name: z.string().optional(),
    execution_uuid: z.string(),
    reconciled: z.number().int().optional(),
  })
);

/**
 * Common step definition for the Track generation step.
 */
export const TrackGenerationStepCommonDefinition: CommonStepDefinition<
  typeof TrackGenerationInputSchema,
  typeof TrackGenerationOutputSchema
> = {
  category: StepCategory.Ai,
  description: i18n.translate('xpack.discoveries.workflowSteps.trackGeneration.description', {
    defaultMessage:
      'Record an Attack Discovery generation that this workflow runs with the default Attack Discovery workflows, so it appears in the Attack Discovery generations view',
  }),
  id: TrackGenerationStepTypeId,
  inputSchema: TrackGenerationInputSchema,
  label: i18n.translate('xpack.discoveries.workflowSteps.trackGeneration.label', {
    defaultMessage: 'Attack Discovery: Track generation',
  }),
  outputSchema: TrackGenerationOutputSchema,
};
