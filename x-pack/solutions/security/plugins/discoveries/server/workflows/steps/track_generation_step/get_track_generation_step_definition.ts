/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup, CoreStart, Logger } from '@kbn/core/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW_ID } from '@kbn/workflows/managed';
import { createAuthenticatedUserForEventLogging } from '@kbn/discoveries/impl/attack_discovery/generation/create_authenticated_user_for_event_logging';
import { getParsedApiConfig } from '@kbn/discoveries/impl/attack_discovery/generation/get_parsed_api_config';
import {
  getStrandedPreviousRunId,
  reconcilePipelineGenerations,
  recordPipelineFailure,
  recordPipelineGeneration,
  recordPipelineRetrieval,
  recordPipelineSuccess,
  startPipelineGeneration,
  type PipelineGenerationContext,
} from '@kbn/discoveries/impl/attack_discovery/generation/track_pipeline_generation';
import type { WorkflowConfig } from '@kbn/discoveries/impl/attack_discovery/generation/types';
import { getSpaceId } from '@kbn/discoveries/impl/lib/helpers/get_space_id';

import { TrackGenerationStepCommonDefinition } from '../../../../common/step_types/track_generation_step';
import { checkManagedWorkflowIntegrity } from '../../../managed_workflows/check_managed_workflow_integrity';
import { getAlertsIndexForSpace } from '../../../lib/get_alerts_index_for_space';
import { isWorkflowsEnabledForSpace } from '../../../lib/is_workflows_enabled_for_space';
import type { DiscoveriesPluginStartDeps } from '../../../types';
import { resolveConnectorDetails } from '../../helpers/resolve_connector_details';
import { resolveDefaultConnectorId } from '../../helpers/resolve_default_connector_id';
import { getPipelineExecutionUuid } from './helpers/get_pipeline_execution_uuid';
import { runWithinDeadline } from './helpers/run_within_deadline';

const DEFAULT_SIZE = 100;

/** Every phase but `started` stops waiting for its writes after this, so it never holds up a run. */
const PHASE_DEADLINE_MS = 20_000;

/**
 * Server-side implementation of the Track generation step.
 *
 * Records a generation that a workflow runs with the default Attack Discovery workflows as its
 * own children: the `started` phase runs the checks the run step runs and writes
 * `generation-started`; the later phases write the same events the run step writes, from the
 * workflow's child runs. `reconcile` marks failed the generations of batch pipeline runs that
 * ended before recording an outcome.
 *
 * A run can only record its own generation: the generation id is derived from the run id, and
 * `reconcile` only runs as a service account the run inherited, over that workload's runs. Only
 * `started` can fail the workflow; every other phase
 * logs a failure to record and continues, so tracking never changes how a run ends.
 */
export const getTrackGenerationStepDefinition = ({
  analytics,
  getEventLogIndex,
  getEventLogger,
  getStartServices,
  logger,
  workflowsManagementApi,
}: {
  analytics?: AnalyticsServiceSetup;
  getEventLogIndex: () => Promise<string>;
  getEventLogger: () => Promise<IEventLogger>;
  getStartServices: () => Promise<{
    coreStart: CoreStart;
    pluginsStart: DiscoveriesPluginStartDeps;
  }>;
  logger: Logger;
  workflowsManagementApi?: WorkflowsServerPluginSetup['management'];
}) =>
  createServerStepDefinition({
    ...TrackGenerationStepCommonDefinition,
    handler: async (context) => {
      const {
        alert_retrieval_mode: alertRetrievalMode = 'custom_query',
        api_config: inputApiConfig,
        connector_id: connectorId,
        error_message: errorMessage,
        execution_uuid: inputExecutionUuid,
        feature_id: featureId,
        phase,
        scope,
        size = DEFAULT_SIZE,
      } = context.input;

      const workflowConfig: WorkflowConfig = {
        alert_retrieval_mode: alertRetrievalMode,
        alert_retrieval_workflow_ids: [],
        alert_retrieval_workflows_enabled: false,
        default_retrieval_enabled: true,
        skill_enabled: false,
        validation_workflow_id: '',
      };

      const getFallbackOutput = () => ({
        output: {
          execution_uuid: inputExecutionUuid ?? '',
          ...(phase === 'reconcile' ? { reconciled: 0 } : {}),
        },
      });

      const run = async () => {
        try {
          if (workflowsManagementApi == null) {
            throw new Error('The Workflows management API is not available');
          }

          const { coreStart, pluginsStart } = await getStartServices();
          const request = context.contextManager.getFakeRequest();
          const { execution, workflow } = context.contextManager.getContext();
          const spaceId = getSpaceId({ request, spaces: pluginsStart.spaces?.spacesService });
          const esClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;
          const getAuthenticatedUser = async () =>
            createAuthenticatedUserForEventLogging({
              authenticationInfo: await esClient.security.authenticate(),
            });

          if (phase === 'reconcile') {
            const workloadId = execution.effectiveIdentity?.inheritedFrom?.workloadId;
            if (workloadId == null) {
              throw new Error(
                'The reconcile phase only runs in a workflow that inherited a service account'
              );
            }
            if (scope == null) {
              throw new Error('The reconcile phase needs a scope');
            }

            const parentExecutionId =
              scope === 'this_run'
                ? execution.id
                : await getStrandedPreviousRunId({
                    currentRunId: execution.id,
                    request,
                    spaceId,
                    workflowId: workflow.id,
                    workflowsManagementApi,
                    workloadId,
                  });
            const reconciled =
              parentExecutionId == null
                ? 0
                : await reconcilePipelineGenerations({
                    authenticatedUser: await getAuthenticatedUser(),
                    coreStart,
                    esClient,
                    eventLogIndex: await getEventLogIndex(),
                    eventLogger: await getEventLogger(),
                    logger,
                    parentExecutionId,
                    pipelineWorkflowId: ALERTZERO_ATTACK_DISCOVERY_BATCH_PIPELINE_WORKFLOW_ID,
                    request,
                    spaceId,
                    workflowsManagementApi,
                  });

            return { output: { execution_uuid: '', reconciled } };
          }

          const resolveStartedApiConfig = async () => {
            const uiSettingsClient = coreStart.uiSettings.asScopedToClient(
              coreStart.savedObjects.getScopedClient(request)
            );

            if (
              !(await isWorkflowsEnabledForSpace({
                featureFlags: coreStart.featureFlags,
                uiSettingsClient,
              }))
            ) {
              throw new Error('Attack Discovery workflows are not enabled for this space');
            }

            const effectiveConnectorId = connectorId
              ? connectorId
              : await resolveDefaultConnectorId({
                  featureId,
                  inference: pluginsStart.inference,
                  logger,
                  request,
                  searchInferenceEndpoints: pluginsStart.searchInferenceEndpoints,
                  uiSettingsClient,
                });

            const { actionTypeId, connectorName } = await resolveConnectorDetails({
              actionsClient: await pluginsStart.actions.getActionsClientWithRequest(request),
              connectorId: effectiveConnectorId,
              inference: pluginsStart.inference,
              logger,
              request,
            });

            return {
              apiConfig: { action_type_id: actionTypeId, connector_id: effectiveConnectorId },
              connectorName,
            };
          };

          const started = phase === 'started' ? await resolveStartedApiConfig() : undefined;
          const apiConfig = started?.apiConfig ?? inputApiConfig;
          const runExecutionUuid = getPipelineExecutionUuid(execution.id);
          const executionUuid = phase === 'started' ? runExecutionUuid : inputExecutionUuid;

          if (apiConfig == null || executionUuid == null || executionUuid === '') {
            throw new Error(
              `The ${phase} phase needs the api_config and execution_uuid of the run`
            );
          }
          if (executionUuid !== runExecutionUuid) {
            throw new Error(`The ${phase} phase can only record the generation this run started`);
          }

          const authenticatedUser = await getAuthenticatedUser();

          const pipelineContext: PipelineGenerationContext = {
            analytics,
            apiConfig: getParsedApiConfig(apiConfig),
            authenticatedUser,
            coreStart,
            esClient,
            eventLogIndex: await getEventLogIndex(),
            eventLogger: await getEventLogger(),
            executionUuid,
            logger,
            pipelineRunId: execution.id,
            pipelineStartedAt: execution.startedAt,
            pipelineWorkflowId: workflow.id,
            request,
            spaceId,
            workflowsManagementApi,
          };

          if (phase === 'started') {
            await startPipelineGeneration({
              alertsCount: size,
              alertsIndexPattern: getAlertsIndexForSpace(spaceId),
              authz: pluginsStart.security.authz,
              checkIntegrity: async ({
                logger: checkLogger,
                spaceId: checkSpaceId,
              }: {
                logger: Logger;
                spaceId: string;
              }) =>
                checkManagedWorkflowIntegrity({
                  analytics,
                  logger: checkLogger,
                  spaceId: checkSpaceId,
                  workflowsExtensions: pluginsStart.workflowsExtensions,
                }),
              context: pipelineContext,
              getStartServices: async () => {
                const services = await getStartServices();
                return {
                  coreStart: services.coreStart,
                  pluginsStart: services.pluginsStart as unknown,
                };
              },
              workflowConfig,
            });

            return {
              output: {
                api_config: apiConfig,
                ...(started?.connectorName != null
                  ? { connector_name: started.connectorName }
                  : {}),
                execution_uuid: executionUuid,
              },
            };
          }

          if (phase === 'retrieval_completed') {
            await recordPipelineRetrieval(pipelineContext);
          } else if (phase === 'generation_completed') {
            await recordPipelineGeneration(pipelineContext);
          } else if (phase === 'succeeded') {
            await recordPipelineSuccess({
              alertsCount: size,
              context: pipelineContext,
              workflowConfig,
            });
          } else {
            await recordPipelineFailure({ context: pipelineContext, errorMessage });
          }

          return { output: { execution_uuid: executionUuid } };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          if (phase === 'started') {
            context.logger.error(
              `Attack Discovery generation could not start: ${message}`,
              error instanceof Error ? error : undefined
            );

            return { error: new Error(message) };
          }

          context.logger.warn(`Failed to record the ${phase} phase of the generation: ${message}`);

          return getFallbackOutput();
        }
      };

      if (phase === 'started') {
        return run();
      }

      return runWithinDeadline({
        deadlineMs: PHASE_DEADLINE_MS,
        onDeadline: () => {
          context.logger.warn(
            `Stopped waiting for the ${phase} phase of the generation after ${
              PHASE_DEADLINE_MS / 1000
            }s`
          );
          return getFallbackOutput();
        },
        task: run,
      });
    },
  });
