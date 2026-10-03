/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationLifecycleSource } from '@kbn/agent-builder-server';
import { loggerMock } from '@kbn/logging-mocks';
import type { ManagedWorkflowInstanceState } from '@kbn/workflows/server/types';
import type { ReadInstalledWorkflow } from './classify_investigation_actor';
import { classifyInvestigationActor } from './classify_investigation_actor';

const installed = (
  definitionId: string | null,
  workflowId = 'wf-1'
): ManagedWorkflowInstanceState => ({
  definitionId,
  documentVersion: 1,
  spaceId: 'default',
  templateValues: null,
  workflowId,
});

const WORKFLOW_SOURCE: ConversationLifecycleSource = {
  isTestRun: false,
  type: 'workflow',
  workflowExecutionId: 'exec-1',
  workflowId: 'wf-1',
};

const classify = (
  source: ConversationLifecycleSource,
  readInstalledWorkflow: ReadInstalledWorkflow = jest.fn(async () => null)
) => {
  const logger = loggerMock.create();
  return {
    logger,
    result: classifyInvestigationActor({
      logger,
      readInstalledWorkflow,
      source,
      spaceId: 'default',
    }),
  };
};

describe('classifyInvestigationActor', () => {
  it.each([
    ['http_api', 'user'],
    ['server_api', 'user'],
    ['execution', 'agent'],
  ] as const)('classifies a %s source as %s without a lookup', async (type, actorClass) => {
    const readInstalledWorkflow = jest.fn(async () => installed('wf-1'));

    expect(await classify({ type }, readInstalledWorkflow).result).toEqual({ actorClass });
    expect(readInstalledWorkflow).not.toHaveBeenCalled();
  });

  it('classifies a workflow AlertZero installed as a worker, with its catalog id', async () => {
    const readInstalledWorkflow = jest.fn(async () =>
      installed('system-security-floor-attack-discovery')
    );

    expect(await classify(WORKFLOW_SOURCE, readInstalledWorkflow).result).toEqual({
      actorClass: 'worker',
      workerId: 'system-security-floor-attack-discovery',
    });
    expect(readInstalledWorkflow).toHaveBeenCalledWith({ spaceId: 'default', workflowId: 'wf-1' });
  });

  it('reports a managed workflow outside the Worker catalog as worker id other', async () => {
    const result = await classify(
      WORKFLOW_SOURCE,
      jest.fn(async () => installed('system-security-attack-discovery-review'))
    ).result;

    expect(result).toEqual({ actorClass: 'worker', workerId: 'other' });
  });

  it('falls back to the workflow id when the installed state has no definition id', async () => {
    const result = await classify(
      { ...WORKFLOW_SOURCE, workflowId: 'system-security-floor-attack-discovery' },
      jest.fn(async () => installed(null, 'system-security-floor-attack-discovery'))
    ).result;

    expect(result).toEqual({
      actorClass: 'worker',
      workerId: 'system-security-floor-attack-discovery',
    });
  });

  it('classifies a workflow AlertZero does not own as a custom workflow', async () => {
    expect(await classify(WORKFLOW_SOURCE).result).toEqual({ actorClass: 'custom_workflow' });
  });

  it('classifies a test run as a custom workflow without a lookup', async () => {
    const readInstalledWorkflow = jest.fn(async () => installed('wf-1'));

    expect(
      await classify({ ...WORKFLOW_SOURCE, isTestRun: true }, readInstalledWorkflow).result
    ).toEqual({ actorClass: 'custom_workflow' });
    expect(readInstalledWorkflow).not.toHaveBeenCalled();
  });

  it('classifies an unattributable workflow write as a custom workflow without a lookup', async () => {
    const readInstalledWorkflow = jest.fn(async () => installed('wf-1'));

    expect(await classify({ type: 'workflow' }, readInstalledWorkflow).result).toEqual({
      actorClass: 'custom_workflow',
    });
    expect(readInstalledWorkflow).not.toHaveBeenCalled();
  });

  it('classifies a workflow it cannot verify as a custom workflow and logs at debug', async () => {
    const { logger, result } = classify(
      WORKFLOW_SOURCE,
      jest.fn(async () => {
        throw new Error('Timed out after 5000ms');
      })
    );

    expect(await result).toEqual({ actorClass: 'custom_workflow' });
    const [message] = logger.debug.mock.calls[0];
    expect(typeof message === 'function' ? message() : message).toContain('Timed out after 5000ms');
  });
});
