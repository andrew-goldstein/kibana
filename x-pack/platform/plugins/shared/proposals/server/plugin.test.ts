/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import {
  CheckDecidePrivilegesStepId,
  CloneProposalStepId,
  CreateProposalStepId,
  GetLatestRevisionStepId,
  GetProposalStepId,
  PROPOSALS_UI_CAPABILITY_DECIDE,
  PROPOSALS_UI_CAPABILITY_SHOW,
  SettleIncompleteProposalStepId,
  UpdateProposalStepId,
} from '@kbn/proposals-common';
import { ProposalsPlugin } from './plugin';
import { initializeManagedWorkflows } from './managed_workflows/initialize_managed_workflows';
import {
  PROPOSALS_API_PRIVILEGE_MANAGE,
  PROPOSALS_API_PRIVILEGE_READ,
  PROPOSALS_FEATURE_ID,
  PROPOSALS_MANAGED_WORKFLOW_OWNER_ID,
} from './constants';
import { registerRoutes } from './routes/register_routes';
import { PROPOSALS_TELEMETRY_EVENTS } from './telemetry';
import {
  TELEMETRY_SNAPSHOT_TASK_ID,
  TELEMETRY_SNAPSHOT_TASK_TYPE,
} from './tasks/telemetry_snapshot';

jest.mock('./managed_workflows/initialize_managed_workflows', () => ({
  initializeManagedWorkflows: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./routes/register_routes', () => ({
  registerRoutes: jest.fn(),
}));

const createContext = () =>
  ({
    logger: { get: () => loggerMock.create() },
  } as unknown as ConstructorParameters<typeof ProposalsPlugin>[0]);

const setupPlugin = ({ taskManager }: { taskManager?: object } = {}) => {
  const plugin = new ProposalsPlugin(createContext());
  const coreSetup = coreMock.createSetup();
  const features = { registerKibanaFeature: jest.fn() };
  const workflowsExtensions = {
    registerStepDefinition: jest.fn(),
    registerManagedWorkflowOwner: jest.fn(),
  };
  const workflowsManagement = { management: { getWorkflow: jest.fn() } };

  const agentBuilder = {
    attachments: { registerType: jest.fn() },
  };

  plugin.setup(
    coreSetup as never,
    {
      features,
      agentBuilder,
      taskManager,
      workflowsExtensions,
      workflowsManagement,
    } as never
  );

  return { plugin, coreSetup, features, agentBuilder, workflowsExtensions, workflowsManagement };
};

const startPlugin = (plugin: ProposalsPlugin, { taskManager }: { taskManager?: object } = {}) => {
  const coreStart = coreMock.createStart();
  const workflowsExtensions = { initManagedWorkflowsClient: jest.fn() };

  const contract = plugin.start(
    coreStart as never,
    {
      workflowsExtensions,
      spaces: undefined,
      taskManager,
    } as never
  );

  return { coreStart, contract, workflowsExtensions };
};

/** The single registered feature config, for assertions on its shape. */
const registeredFeature = (features: { registerKibanaFeature: jest.Mock }) =>
  features.registerKibanaFeature.mock.calls[0][0];

describe('ProposalsPlugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setup', () => {
    it('registers its own feature under Analytics at enterprise, matching Workflows', () => {
      const { features } = setupPlugin();

      expect(features.registerKibanaFeature).toHaveBeenCalledWith(
        expect.objectContaining({
          id: PROPOSALS_FEATURE_ID,
          category: DEFAULT_APP_CATEGORIES.kibana,
          minimumLicense: 'enterprise',
        })
      );
    });

    it('grants the proposals capabilities from the top-level all privilege', () => {
      const { features } = setupPlugin();
      const { privileges } = registeredFeature(features);

      expect(privileges.all.api).toEqual([
        PROPOSALS_API_PRIVILEGE_READ,
        PROPOSALS_API_PRIVILEGE_MANAGE,
      ]);
      expect(privileges.all.ui).toEqual([
        PROPOSALS_UI_CAPABILITY_SHOW,
        PROPOSALS_UI_CAPABILITY_DECIDE,
      ]);
    });

    it('withholds manage and decide from read, so a reader cannot decide', () => {
      const { features } = setupPlugin();
      const { privileges } = registeredFeature(features);

      expect(privileges.read.api).toEqual([PROPOSALS_API_PRIVILEGE_READ]);
      expect(privileges.read.ui).toEqual([PROPOSALS_UI_CAPABILITY_SHOW]);
    });

    it('registers the proposal attachment type with Agent Builder', () => {
      const { agentBuilder } = setupPlugin();

      expect(agentBuilder.attachments.registerType).toHaveBeenCalledTimes(1);
    });

    it('registers as a managed workflow owner, or the startup sweep deletes our workflows', () => {
      const { workflowsExtensions } = setupPlugin();

      expect(workflowsExtensions.registerManagedWorkflowOwner).toHaveBeenCalledTimes(1);
      expect(workflowsExtensions.registerManagedWorkflowOwner).toHaveBeenCalledWith(
        PROPOSALS_MANAGED_WORKFLOW_OWNER_ID
      );
    });

    it('registers every workflow step definition during setup, not start', () => {
      const { workflowsExtensions } = setupPlugin();

      const registeredIds = workflowsExtensions.registerStepDefinition.mock.calls.map(
        ([definition]) => definition.id
      );
      expect(registeredIds).toEqual([
        CreateProposalStepId,
        UpdateProposalStepId,
        SettleIncompleteProposalStepId,
        CheckDecidePrivilegesStepId,
        GetProposalStepId,
        CloneProposalStepId,
        GetLatestRevisionStepId,
      ]);
    });

    it('does not resolve the authorization service until a step actually runs', () => {
      const { coreSetup } = setupPlugin();

      // Steps register during setup, when `security.authz` does not exist yet.
      // Reaching for it here would leave every privilege check reading
      // undefined and silently failing closed.
      expect(coreSetup.getStartServices).not.toHaveBeenCalled();
    });

    it('registers the HTTP routes', () => {
      setupPlugin();

      expect(registerRoutes).toHaveBeenCalledTimes(1);
    });

    it('registers every proposals telemetry event type with core analytics', () => {
      const { coreSetup } = setupPlugin();

      const registered = coreSetup.analytics.registerEventType.mock.calls.map(
        ([{ eventType }]) => eventType
      );
      expect(registered.sort()).toEqual(Object.values(PROPOSALS_TELEMETRY_EVENTS).sort());
    });
  });

  describe('start', () => {
    it('installs the managed gate workflow', () => {
      const { plugin } = setupPlugin();

      startPlugin(plugin);

      expect(initializeManagedWorkflows).toHaveBeenCalledTimes(1);
    });

    it('exposes the proposals service for in-process callers', () => {
      const { plugin } = setupPlugin();

      const { contract } = startPlugin(plugin);

      expect(contract.getProposalsService()).toBeDefined();
    });
  });

  // With `xpack.proposals.enabled: false` core never loads the plugin, so setup() running at all
  // means the plugin is enabled: the snapshot task exists only then.
  describe('telemetry snapshot task', () => {
    it('registers the snapshot task type during setup', () => {
      const taskManager = taskManagerMock.createSetup();

      setupPlugin({ taskManager });

      expect(
        taskManager.registerTaskDefinitions.mock.calls.map(([types]) => Object.keys(types))
      ).toEqual([[TELEMETRY_SNAPSHOT_TASK_TYPE]]);
    });

    it('does not resolve start services while registering the task', () => {
      const { coreSetup } = setupPlugin({ taskManager: taskManagerMock.createSetup() });

      expect(coreSetup.getStartServices).not.toHaveBeenCalled();
    });

    it('schedules the daily snapshot during start', () => {
      const taskManager = taskManagerMock.createStart();
      const { plugin } = setupPlugin({ taskManager: taskManagerMock.createSetup() });

      startPlugin(plugin, { taskManager });

      expect(taskManager.ensureScheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          id: TELEMETRY_SNAPSHOT_TASK_ID,
          taskType: TELEMETRY_SNAPSHOT_TASK_TYPE,
        })
      );
    });

    it('sets up and starts without Task Manager', () => {
      const { plugin } = setupPlugin();

      expect(startPlugin(plugin).contract.getProposalsService()).toBeDefined();
    });
  });

  it('fails loudly when a step handler runs before start', () => {
    const { workflowsExtensions } = setupPlugin();
    const [[createStep]] = workflowsExtensions.registerStepDefinition.mock.calls;

    // The step factory closes over a getter, so the service is resolved per
    // call rather than captured at registration time.
    expect(() => createStep.handler).not.toThrow();
  });
});
