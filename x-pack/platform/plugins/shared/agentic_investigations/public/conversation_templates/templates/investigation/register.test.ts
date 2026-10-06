/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/public/mocks';
import {
  createFlyoutGroupedAttachmentsRegistry,
  registerAgenticInvestigationTemplateUI,
  type CloseInvestigationModalRenderProps,
} from '@kbn/agentic-investigations-common';
import { FLYOUT_INTERACTION_EVENT_TYPE } from '../../../telemetry/flyout_interaction_event';
import { LazyConnectedCloseInvestigationModal } from '../../shared/lazy_connected_components';
import type { TemplateRegistrationContext } from '../../registry/types';
import { investigationTemplate } from './register';

jest.mock('@kbn/agentic-investigations-common', () => ({
  ...jest.requireActual('@kbn/agentic-investigations-common'),
  registerAgenticInvestigationTemplateUI: jest.fn(),
}));

const mockCloseModal = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('../../shared/connected_status/connected_close_investigation_modal', () => ({
  ConnectedCloseInvestigationModal: (props: Record<string, unknown>) => mockCloseModal(props),
}));
jest.mock('../../shared/escalation_modal/connected_escalation_modal', () => ({
  ConnectedEscalationModal: () => null,
}));
jest.mock('../../shared/privileges/privilege_gate', () => ({
  PrivilegeGate: ({ children }: React.PropsWithChildren) => children,
}));

const mockRegisterInvestigationUI = registerAgenticInvestigationTemplateUI as jest.Mock;

const CLOSE_MODAL_PROPS = {
  investigation: { id: 'inv-1' },
  onClose: jest.fn(),
} as unknown as CloseInvestigationModalRenderProps;

type LazyLoader = () => Promise<React.ComponentType<object>>;

const register = () => {
  const core = coreMock.createStart();
  const loaders: LazyLoader[] = [];
  const makeLazyWithProviders = jest.fn((getComponent: LazyLoader) => {
    loaders.push(getComponent);
    return React.lazy(async () => ({ default: await getComponent() }));
  });

  investigationTemplate.register({
    core,
    escalationsEnabled: true,
    getImpactEntityOpener: () => undefined,
    groupedAttachments: createFlyoutGroupedAttachmentsRegistry(),
    makeLazyWithProviders,
    renderAssignees: jest.fn(),
    renderStatus: jest.fn(),
    services: {},
    startDeps: { agentBuilder: agentBuilderMocks.createStart() },
    templateId: 'investigation',
  } as unknown as TemplateRegistrationContext);

  return { core, loaders, options: mockRegisterInvestigationUI.mock.calls[0][0] };
};

/** Renders each lazily loaded component once, so the close modal's wrapper renders the modal. */
const renderLoadedComponents = async (loaders: LazyLoader[]) => {
  const components = await Promise.all(loaders.map((load) => load()));
  components.forEach((Component) =>
    render(React.createElement(Component, CLOSE_MODAL_PROPS as unknown as object))
  );
};

describe('investigationTemplate flyout telemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports open_chat for the investigation template when the footer opens the chat', () => {
    const { core, options } = register();

    options.onOpenChat();

    expect(core.analytics.reportEvent).toHaveBeenCalledWith(FLYOUT_INTERACTION_EVENT_TYPE, {
      interaction: 'open_chat',
      template_id: 'investigation',
    });
  });

  it('passes the flyout close modal an onClosed that reports status_edit', async () => {
    const { core, loaders } = register();
    await renderLoadedComponents(loaders);
    const { onClosed } = mockCloseModal.mock.calls[0][0] as { onClosed: () => void };

    onClosed();

    expect(core.analytics.reportEvent).toHaveBeenCalledWith(FLYOUT_INTERACTION_EVENT_TYPE, {
      interaction: 'status_edit',
      template_id: 'investigation',
    });
  });

  it('reports nothing just for rendering the flyout close modal', async () => {
    const { core, loaders } = register();

    await renderLoadedComponents(loaders);

    expect(core.analytics.reportEvent).not.toHaveBeenCalled();
  });

  it('gives the close modal a solution renders on its own page no onClosed, so it reports nothing', async () => {
    render(
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(LazyConnectedCloseInvestigationModal, CLOSE_MODAL_PROPS)
      )
    );

    await waitFor(() => expect(mockCloseModal).toHaveBeenCalled());
    expect(mockCloseModal.mock.calls[0][0]).not.toHaveProperty('onClosed');
  });
});
