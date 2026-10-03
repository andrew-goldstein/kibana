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
import { ConnectedCloseInvestigationModal } from './connected_close_investigation_modal';

jest.mock('../../../investigations/hooks/use_investigations_api');
jest.mock('../close_confirmation/close_investigation_modal', () => ({
  CloseInvestigationModal: ({ onConfirm }: { onConfirm: (params: object) => void }) => (
    <button data-test-subj="confirmClose" onClick={() => onConfirm({})}>
      Close
    </button>
  ),
}));

const mockMutation = (outcome: 'success' | 'error') => ({
  isLoading: false,
  mutate: jest.fn(
    (
      _vars: unknown,
      {
        onSuccess,
        onError,
      }: { onSuccess: (result: object) => void; onError: (error: Error) => void }
    ) =>
      outcome === 'success'
        ? onSuccess({ failed_proposal_ids: [] })
        : onError(new Error('internal error'))
  ),
});

const renderModal = (onClosed: () => void, onClose: () => void) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConnectedCloseInvestigationModal
        investigation={{ id: 'conv-1', conversationId: 'conv-1' } as never}
        onClose={onClose}
        onClosed={onClosed}
      />
    </QueryClientProvider>
  );

beforeEach(() => {
  (useInvestigationClosePreview as jest.Mock).mockReturnValue({
    data: { pending_proposals: [] },
  });
});

afterEach(() => jest.clearAllMocks());

describe('ConnectedCloseInvestigationModal onClosed', () => {
  it('is called once the close lands, before the modal closes', () => {
    (useSetInvestigationStatus as jest.Mock).mockReturnValue(mockMutation('success'));
    const calls: string[] = [];
    renderModal(
      () => calls.push('closed'),
      () => calls.push('close')
    );

    fireEvent.click(screen.getByTestId('confirmClose'));

    expect(calls).toEqual(['closed', 'close']);
  });

  it('is not called when the close fails', () => {
    (useSetInvestigationStatus as jest.Mock).mockReturnValue(mockMutation('error'));
    const onClosed = jest.fn();
    renderModal(onClosed, jest.fn());

    fireEvent.click(screen.getByTestId('confirmClose'));

    expect(onClosed).not.toHaveBeenCalled();
  });
});
