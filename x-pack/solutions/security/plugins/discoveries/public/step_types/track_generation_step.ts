/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import {
  TrackGenerationStepCommonDefinition,
  TrackGenerationStepTypeId,
} from '../../common/step_types/track_generation_step';

export const trackGenerationStepPublicDefinition: PublicStepDefinition = {
  ...TrackGenerationStepCommonDefinition,

  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/sparkles').then(({ icon }) => ({
      default: icon,
    }))
  ),

  documentation: {
    details: i18n.translate(
      'xpack.discoveries.workflowSteps.trackGeneration.documentation.details',
      {
        defaultMessage: `Records an Attack Discovery generation that this workflow runs itself, by calling the default alert retrieval, generation and validation workflows with {workflowExecute}. The generation then appears in the Attack Discovery generations view, with the same execution details as a {runStep} run.

Call it with {phaseField}:
- {started}: before alert retrieval. Checks that Attack Discovery workflows are enabled and authorized in the space, resolves the connector, and returns {apiConfigField} and {executionUuidField} for the later phases.
- {retrievalCompleted}, {generationCompleted} and {succeeded}: after each phase.
- {failed}: from the workflow's failure handler.
- {reconcile}: from a workflow that runs the Attack Discovery batch pipeline workflow as its own children, with {scopeField} {thisRun} after them, or {previousRun} before them. Marks failed each generation whose pipeline run timed out or was cancelled before it recorded its outcome.

Every phase records only the generation that its own workflow run started, and {reconcile} only runs in a workflow that inherited a service account. Only {started} can fail the workflow.`,
        values: {
          apiConfigField: '`api_config`',
          executionUuidField: '`execution_uuid`',
          failed: '`failed`',
          generationCompleted: '`generation_completed`',
          phaseField: '`phase`',
          previousRun: '`previous_run`',
          reconcile: '`reconcile`',
          retrievalCompleted: '`retrieval_completed`',
          runStep: '`security.attack-discovery.run`',
          scopeField: '`scope`',
          started: '`started`',
          succeeded: '`succeeded`',
          thisRun: '`this_run`',
          workflowExecute: '`workflow.execute`',
        },
      }
    ),
    examples: [
      `## Start, then record the end of alert retrieval
\`\`\`yaml
- name: start_generation
  type: ${TrackGenerationStepTypeId}
  with:
    phase: started
    feature_id: my_feature
- name: retrieve_alerts
  type: workflow.execute
  with:
    workflow-id: system-attack-discovery-alert-retrieval
    inputs:
      api_config: \${{ steps.start_generation.output.api_config }}
- name: retrieval_completed
  type: ${TrackGenerationStepTypeId}
  with:
    phase: retrieval_completed
    api_config: \${{ steps.start_generation.output.api_config }}
    execution_uuid: "{{ steps.start_generation.output.execution_uuid }}"
\`\`\``,
    ],
  },
};
