/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type CoreSetup,
  type CoreStart,
  type KibanaRequest,
  type Logger,
  type Plugin,
  type PluginInitializerContext,
} from '@kbn/core/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { PROPOSALS_MANAGED_WORKFLOW_OWNER_ID } from './constants';
import { registerFeatures } from './features';
import { initializeManagedWorkflows } from './managed_workflows/initialize_managed_workflows';
import { registerRoutes } from './routes/register_routes';
import { ProposalsService } from './services/proposals_service';
import { createProposalPrivilegesChecker } from './services/check_proposal_privileges';
import type { ProposalPrivilegesChecker } from './services/check_proposal_privileges';
import { createProposalUserResolver } from './services/resolve_proposal_user';
import type { ResolveProposalUser } from './services/resolve_proposal_user';
import { registerProposalAttachment } from './attachments';
import { reviseProposalTool } from './agent_builder/tools/revise_proposal_tool';
import { createProposalManagementSkill } from './agent_builder/skills/proposal_management';
import { registerStepDefinitions } from './step_types';
import { createProposalsStorageClient } from './storage/proposals_storage';
import {
  createProposalsTelemetryReporter,
  readTelemetryOptIn,
  registerProposalsTelemetryEvents,
} from './telemetry';
import type {
  ProposalsPluginSetup,
  ProposalsPluginStart,
  ProposalsSetupDependencies,
  ProposalsStartDependencies,
} from './types';

/**
 * How long a gate write waits for the telemetry opt-in before reading it as opted out. The
 * telemetry plugin replays its latest decision, so this only bounds a plugin that never answers.
 */
const TELEMETRY_OPT_IN_WRITE_PATH_TIMEOUT_MS = 1_000;

export class ProposalsPlugin
  implements
    Plugin<
      ProposalsPluginSetup,
      ProposalsPluginStart,
      ProposalsSetupDependencies,
      ProposalsStartDependencies
    >
{
  private readonly logger: Logger;
  private workflowsManagementApi?: WorkflowsServerPluginSetup['management'];
  // `workflowsManagement` is a required plugin, so this is set in setup() and
  // read only from start() onwards; the getter asserts that ordering.
  private proposalsService?: ProposalsService;
  private proposalPrivileges?: ProposalPrivilegesChecker;
  private spaces?: ProposalsStartDependencies['spaces'];
  private resolveUser?: ResolveProposalUser;
  private telemetryStart?: ProposalsStartDependencies['telemetry'];

  constructor(context: PluginInitializerContext) {
    this.logger = context.logger.get();
  }

  setup(
    coreSetup: CoreSetup<ProposalsStartDependencies>,
    { agentBuilder, features, workflowsExtensions, workflowsManagement }: ProposalsSetupDependencies
  ): ProposalsPluginSetup {
    // The workflows management API is only exposed on the setup contract.
    this.workflowsManagementApi = workflowsManagement.management;

    registerFeatures({ features });

    const privileges = this.getProposalPrivilegesChecker(coreSetup);
    agentBuilder.tools.register(
      reviseProposalTool({
        getProposalsService: () => this.requireProposalsService(),
        privileges,
      })
    );
    agentBuilder.skills.register(
      createProposalManagementSkill((request) => privileges.canManage(request))
    );

    // Setup-only, and registering a type twice throws. Emitters report through
    // `createProposalsTelemetryReporter`, which never throws.
    registerProposalsTelemetryEvents(coreSetup.analytics);

    // The service only exists from start() onwards, but `format()` is never
    // called before then, so it is resolved lazily rather than captured here.
    registerProposalAttachment(agentBuilder, {
      getProposalsService: () => this.requireProposalsService(),
      // Reads go through the internal user, so the formatter has to check the
      // caller's privilege itself — same as every other proposal read surface.
      privileges: this.getProposalPrivilegesChecker(coreSetup),
      logger: this.logger,
    });

    // Declares ownership of this plugin's managed workflows. Without it the
    // startup orphan sweep treats every workflow we installed as owned by an
    // unregistered plugin and force-deletes it.
    workflowsExtensions.registerManagedWorkflowOwner(PROPOSALS_MANAGED_WORKFLOW_OWNER_ID);

    registerStepDefinitions({
      workflowsExtensions,
      getProposalsService: () => this.requireProposalsService(),
      getWorkflowsApi: () => this.requireWorkflowsApi(),
      isTelemetryOptedIn: () => this.isTelemetryOptedIn(),
      resolveUser: (request) => this.requireUserResolver()(request),
      // Steps register during setup but only run once Kibana has started, so
      // the authorization service is resolved per call rather than captured
      // here — `security.authz` does not exist yet.
      privileges: this.getProposalPrivilegesChecker(coreSetup),
    });

    registerRoutes({
      router: coreSetup.http.createRouter(),
      logger: this.logger,
      getProposalsService: () => this.requireProposalsService(),
      getSpaceId: (request) => this.getSpaceId(request),
      resolveUser: (request) => this.requireUserResolver()(request),
    });

    return {};
  }

  start(coreStart: CoreStart, plugins: ProposalsStartDependencies): ProposalsPluginStart {
    this.spaces = plugins.spaces;
    this.telemetryStart = plugins.telemetry;
    this.resolveUser = createProposalUserResolver({
      userProfile: coreStart.userProfile,
      security: coreStart.security,
      logger: this.logger,
    });

    // Reads and writes go through the internal user; authorization is enforced
    // at the API layer.
    const storage = createProposalsStorageClient({
      esClient: coreStart.elasticsearch.client.asInternalUser,
      logger: this.logger,
    });

    this.proposalsService = new ProposalsService({
      storage,
      logger: this.logger,
      getWorkflowsApi: () => this.requireWorkflowsApi(),
      getAttachmentsClient: (request) =>
        plugins.agentBuilder.attachments.getScopedClient({ request }),
      // Core analytics applies the telemetry opt-in itself, so the reporter
      // needs no check of its own.
      telemetry: createProposalsTelemetryReporter({
        analytics: coreStart.analytics,
        logger: this.logger,
      }),
      // Lets the reads made only for telemetry be skipped on an opted-out cluster.
      isTelemetryOptedIn: () => this.isTelemetryOptedIn(),
    });

    void initializeManagedWorkflows({
      workflowsExtensions: plugins.workflowsExtensions,
      logger: this.logger,
    }).catch((error) => {
      this.logger.error(
        `Proposals managed workflow initialization failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });

    return {
      getProposalsService: () => this.requireProposalsService(),
      getProposalPrivileges: () => this.requireProposalPrivileges(),
    };
  }

  /**
   * Whether telemetry is opted in right now. Never throws: no telemetry plugin, or no decision
   * within the timeout, reads as opted out, so a write path is never held up for long.
   */
  private isTelemetryOptedIn(): Promise<boolean> {
    return readTelemetryOptIn({
      isOptedIn$: this.telemetryStart?.isOptedIn$,
      timeoutMs: TELEMETRY_OPT_IN_WRITE_PATH_TIMEOUT_MS,
    });
  }

  private requireWorkflowsApi(): WorkflowsServerPluginSetup['management'] {
    if (!this.workflowsManagementApi) {
      throw new Error(
        'Workflows management API is not available until the proposals plugin has been set up'
      );
    }
    return this.workflowsManagementApi;
  }

  private requireProposalsService(): ProposalsService {
    if (!this.proposalsService) {
      throw new Error('Proposals service is not available until the proposals plugin has started');
    }
    return this.proposalsService;
  }

  // Resolves security lazily per call, so step registration can use it during setup.
  private getProposalPrivilegesChecker(
    coreSetup: CoreSetup<ProposalsStartDependencies>
  ): ProposalPrivilegesChecker {
    if (!this.proposalPrivileges) {
      this.proposalPrivileges = createProposalPrivilegesChecker({
        getSecurity: async () => (await coreSetup.getStartServices())[1].security,
        logger: this.logger,
      });
    }
    return this.proposalPrivileges;
  }

  private requireProposalPrivileges(): ProposalPrivilegesChecker {
    if (!this.proposalPrivileges) {
      throw new Error(
        'Proposal privileges checker is not available until the proposals plugin has been set up'
      );
    }
    return this.proposalPrivileges;
  }

  private getSpaceId(request: KibanaRequest): string {
    return this.spaces?.spacesService.getSpaceId(request) ?? 'default';
  }

  /**
   * Server-derived so a caller can never attribute a decision to someone else.
   * Built in `start()`, and only ever called from a request handler or a step.
   */
  private requireUserResolver(): ResolveProposalUser {
    if (!this.resolveUser) {
      throw new Error('User resolution is not available until the proposals plugin has started');
    }
    return this.resolveUser;
  }

  stop() {}
}
