/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import { I18nProvider } from '@kbn/i18n-react';
import { Router } from '@kbn/shared-ux-router';
import { createMemoryHistory } from 'history';
import { coreMock } from '@kbn/core/public/mocks';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { ScanFailuresResponse } from '@kbn/alertzero-common';
import { SYSTEM_SECURITY_WATCH_FLOOR_ID } from '@kbn/alertzero-common';
import type { UseQueryResult } from '@kbn/react-query';
import { useScanFailures } from '../../hooks/use_scan_failures';
import { ScanFailureCallout } from './scan_failure_callout';

jest.mock('../../hooks/use_scan_failures', () => ({
  useScanFailures: jest.fn(),
}));

const useScanFailuresMock = useScanFailures as jest.MockedFunction<typeof useScanFailures>;

const queryResult = (
  value: Pick<UseQueryResult<ScanFailuresResponse>, 'data' | 'error' | 'isLoading'>
): UseQueryResult<ScanFailuresResponse> => value as unknown as UseQueryResult<ScanFailuresResponse>;

const renderCallout = (surface: 'queue' | 'onboarding' = 'queue') => {
  const core = coreMock.createStart();
  const tree = () => (
    <I18nProvider>
      <EuiProvider>
        <KibanaContextProvider services={core}>
          <Router history={createMemoryHistory()}>
            <ScanFailureCallout surface={surface} />
          </Router>
        </KibanaContextProvider>
      </EuiProvider>
    </I18nProvider>
  );
  const { rerender } = render(tree());
  return { reportEvent: core.analytics.reportEvent as jest.Mock, rerender: () => rerender(tree()) };
};

describe('ScanFailureCallout', () => {
  it('renders nothing while the query is loading', () => {
    useScanFailuresMock.mockReturnValue(
      queryResult({
        data: undefined,
        isLoading: true,
        error: null,
      })
    );

    renderCallout();

    expect(screen.queryByTestId('alertZeroScanFailureCallout')).not.toBeInTheDocument();
  });

  it('renders nothing when the query fails', () => {
    useScanFailuresMock.mockReturnValue(
      queryResult({
        data: undefined,
        isLoading: false,
        error: new Error('unavailable'),
      })
    );

    renderCallout();

    expect(screen.queryByTestId('alertZeroScanFailureCallout')).not.toBeInTheDocument();
  });

  it('renders nothing when nothing failed', () => {
    useScanFailuresMock.mockReturnValue(
      queryResult({
        data: { workers: [], unknown: false },
        isLoading: false,
        error: null,
      })
    );

    renderCallout();

    expect(screen.queryByTestId('alertZeroScanFailureCallout')).not.toBeInTheDocument();
  });

  it('links a failing Worker to its Watch page', () => {
    useScanFailuresMock.mockReturnValue(
      queryResult({
        data: {
          workers: [
            {
              workerId: 'system-security-floor-attack-discovery',
              watchId: SYSTEM_SECURITY_WATCH_FLOOR_ID,
            },
          ],
          unknown: false,
        },
        isLoading: false,
        error: null,
      })
    );

    renderCallout();

    expect(screen.getByRole('link', { name: 'Attack Discovery' })).toHaveAttribute(
      'href',
      `/watches/${SYSTEM_SECURITY_WATCH_FLOOR_ID}`
    );
  });

  it('shows the generic line', () => {
    useScanFailuresMock.mockReturnValue(
      queryResult({
        data: { workers: [], unknown: true },
        isLoading: false,
        error: null,
      })
    );

    renderCallout();

    expect(screen.getByTestId('alertZeroScanFailureUnknown')).toHaveTextContent(
      'Another scan reported a problem.'
    );
  });

  it('does not link the generic line', () => {
    useScanFailuresMock.mockReturnValue(
      queryResult({
        data: { workers: [], unknown: true },
        isLoading: false,
        error: null,
      })
    );

    renderCallout();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  describe('telemetry', () => {
    it('reports the callout once, as a Worker scan failure on its surface', () => {
      useScanFailuresMock.mockReturnValue(
        queryResult({
          data: { workers: [], unknown: true },
          isLoading: false,
          error: null,
        })
      );

      const { reportEvent, rerender } = renderCallout('onboarding');
      rerender();

      expect(reportEvent.mock.calls).toEqual([
        ['alertzero_ui_error_shown', { error_class: 'worker_scan_failed', surface: 'onboarding' }],
      ]);
    });

    it('reports nothing when nothing failed, or the failures could not be read', () => {
      useScanFailuresMock.mockReturnValue(
        queryResult({ data: undefined, isLoading: false, error: new Error('unavailable') })
      );
      const unreadable = renderCallout();
      useScanFailuresMock.mockReturnValue(
        queryResult({ data: { workers: [], unknown: false }, isLoading: false, error: null })
      );
      const clean = renderCallout();

      expect([unreadable.reportEvent, clean.reportEvent].map((mock) => mock.mock.calls)).toEqual([
        [],
        [],
      ]);
    });
  });
});
