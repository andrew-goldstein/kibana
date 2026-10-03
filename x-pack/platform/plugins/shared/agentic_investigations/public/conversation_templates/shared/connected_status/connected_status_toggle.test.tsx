/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import {
  useSetInvestigationStatus,
  useInvestigationClosePreview,
} from '../../../investigations/hooks/use_investigations_api';
import {
  useSetEscalationStatus,
  useEscalationClosePreview,
} from '../../../escalations/hooks/use_escalations_api';
import { useCanManageInvestigations } from '../../../investigations/hooks/use_can_manage_investigations';
import { useCanManageEscalations } from '../../../escalations/hooks/use_escalation_privileges';
import { useReportFlyoutInteraction } from '../../../telemetry/use_report_flyout_interaction';
import { ConnectedStatusToggle } from './connected_status_toggle';

jest.mock('../../../investigations/hooks/use_investigations_api');
jest.mock('../../../escalations/hooks/use_escalations_api');
jest.mock('../../../investigations/hooks/use_can_manage_investigations');
jest.mock('../../../escalations/hooks/use_escalation_privileges');
jest.mock('../../../telemetry/use_report_flyout_interaction');

jest.mock('@kbn/agentic-investigations-common', () => ({
  ...jest.requireActual('@kbn/agentic-investigations-common'),
  StatusToggle: ({ onChange }: { onChange: (status: 'open' | 'closed') => void }) => (
    <button data-test-subj="reopen" onClick={() => onChange('open')}>
      Reopen
    </button>
  ),
}));

const reportFlyoutInteraction = jest.fn();

const mockMutation = (outcome: 'success' | 'error') => ({
  isLoading: false,
  mutate: jest.fn(
    (_vars: unknown, { onSuccess, onError }: { onSuccess: () => void; onError: () => void }) =>
      outcome === 'success' ? onSuccess() : onError()
  ),
});

const renderToggle = (templateId: 'investigation' | 'escalation') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConnectedStatusToggle conversationId="conv-1" templateId={templateId} status="closed" />
    </QueryClientProvider>
  );

beforeEach(() => {
  (useReportFlyoutInteraction as jest.Mock).mockReturnValue(reportFlyoutInteraction);
  (useCanManageInvestigations as jest.Mock).mockReturnValue(true);
  (useCanManageEscalations as jest.Mock).mockReturnValue(true);
  (useInvestigationClosePreview as jest.Mock).mockReturnValue({});
  (useEscalationClosePreview as jest.Mock).mockReturnValue({});
});

afterEach(() => jest.clearAllMocks());

describe('ConnectedStatusToggle telemetry', () => {
  it.each(['investigation', 'escalation'] as const)(
    'reports status_edit for a %s status change that lands',
    (templateId) => {
      (useSetInvestigationStatus as jest.Mock).mockReturnValue(mockMutation('success'));
      (useSetEscalationStatus as jest.Mock).mockReturnValue(mockMutation('success'));
      renderToggle(templateId);

      fireEvent.click(screen.getByTestId('reopen'));

      expect(reportFlyoutInteraction).toHaveBeenCalledTimes(1);
      expect(reportFlyoutInteraction).toHaveBeenCalledWith('status_edit', templateId);
    }
  );

  it('does not report a status change that fails', () => {
    (useSetInvestigationStatus as jest.Mock).mockReturnValue(mockMutation('error'));
    (useSetEscalationStatus as jest.Mock).mockReturnValue(mockMutation('error'));
    renderToggle('investigation');

    fireEvent.click(screen.getByTestId('reopen'));

    expect(reportFlyoutInteraction).not.toHaveBeenCalled();
  });
});
