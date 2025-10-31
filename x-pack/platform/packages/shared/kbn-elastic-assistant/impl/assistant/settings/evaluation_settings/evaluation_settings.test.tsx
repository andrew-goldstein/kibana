/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import type { HttpSetup } from '@kbn/core-http-browser';
import { EvaluationSettings } from './evaluation_settings';
import { useAssistantContext } from '../../../assistant_context';
import { useLoadConnectors } from '../../../connectorland/use_load_connectors';
import { usePerformEvaluation } from '../../api/evaluate/use_perform_evaluation';
import { useEvaluationData } from '../../api/evaluate/use_evaluation_data';

jest.mock('../../../assistant_context');
jest.mock('../../../connectorland/use_load_connectors');
jest.mock('../../api/evaluate/use_perform_evaluation');
jest.mock('../../api/evaluate/use_evaluation_data');
jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(),
}));
jest.mock('./attack_discovery_example_generation_section', () => ({
  AttackDiscoveryExampleGenerationSection: jest.fn(() => (
    <div data-test-subj="attack-discovery-example-generation-section">
      {'Attack Discovery Example Generation Section Mock'}
    </div>
  )),
}));

const mockUseAssistantContext = useAssistantContext as jest.Mock;
const mockUseLoadConnectors = useLoadConnectors as jest.Mock;
const mockUsePerformEvaluation = usePerformEvaluation as jest.Mock;
const mockUseEvaluationData = useEvaluationData as jest.Mock;
const mockUseKibana = jest.requireMock('@kbn/kibana-react-plugin/public').useKibana;

describe('EvaluationSettings', () => {
  const mockHttp = {} as HttpSetup;
  const mockToasts = {
    addSuccess: jest.fn(),
    addDanger: jest.fn(),
    addWarning: jest.fn(),
    addError: jest.fn(),
  };
  const mockSettings = {};
  const mockTraceOptions = {
    apmUrl: '',
    langSmithProject: '',
    langSmithApiKey: '',
  };
  const mockSetTraceOptions = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAssistantContext.mockReturnValue({
      actionTypeRegistry: {
        get: jest.fn().mockReturnValue({ id: '.gen-ai' }),
      },
      http: mockHttp,
      setTraceOptions: mockSetTraceOptions,
      toasts: mockToasts,
      traceOptions: mockTraceOptions,
      settings: mockSettings,
    });

    mockUseKibana.mockReturnValue({
      services: {
        featureFlags: {
          getBooleanValue: jest.fn().mockReturnValue(true),
        },
      },
    });

    mockUseLoadConnectors.mockReturnValue({
      data: [
        {
          id: 'connector1',
          name: 'Test Connector 1',
          actionTypeId: '.gen-ai',
          isPreconfigured: false,
        },
        {
          id: 'connector2',
          name: 'Test Connector 2',
          actionTypeId: '.gen-ai',
          isPreconfigured: false,
        },
      ],
      isLoading: false,
    });

    mockUsePerformEvaluation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    });

    mockUseEvaluationData.mockReturnValue({
      data: {
        datasets: ['dataset1', 'dataset2'],
        graphs: ['graph1', 'graph2'],
        results: [],
      },
      isLoading: false,
    });
  });

  describe('Rendering', () => {
    it('renders the evaluation settings panel', () => {
      render(
        <IntlProvider locale="en">
          <EvaluationSettings />
        </IntlProvider>
      );

      expect(screen.getByText('Run Details')).toBeInTheDocument();
      expect(screen.getByText('Predictions')).toBeInTheDocument();
    });

    it('renders the perform evaluation button', () => {
      render(
        <IntlProvider locale="en">
          <EvaluationSettings />
        </IntlProvider>
      );

      expect(screen.getByText('Perform evaluation...')).toBeInTheDocument();
    });
  });

  describe('Attack Discovery Example Generation Section', () => {
    describe('when feature flag is enabled', () => {
      beforeEach(() => {
        mockUseKibana.mockReturnValue({
          services: {
            featureFlags: {
              getBooleanValue: jest.fn().mockReturnValue(true),
            },
          },
        });
      });

      it('renders the example generation section', () => {
        render(
          <IntlProvider locale="en">
            <EvaluationSettings />
          </IntlProvider>
        );

        expect(
          screen.getByTestId('attack-discovery-example-generation-section')
        ).toBeInTheDocument();
      });
    });

    describe('when feature flag is disabled', () => {
      beforeEach(() => {
        mockUseKibana.mockReturnValue({
          services: {
            featureFlags: {
              getBooleanValue: jest.fn().mockReturnValue(false),
            },
          },
        });
      });

      it('does not render the example generation section', () => {
        render(
          <IntlProvider locale="en">
            <EvaluationSettings />
          </IntlProvider>
        );

        expect(
          screen.queryByTestId('attack-discovery-example-generation-section')
        ).not.toBeInTheDocument();
      });
    });

    describe('when featureFlags service is unavailable', () => {
      beforeEach(() => {
        mockUseKibana.mockReturnValue({
          services: {},
        });
      });

      it('does not render the example generation section', () => {
        render(
          <IntlProvider locale="en">
            <EvaluationSettings />
          </IntlProvider>
        );

        expect(screen.queryByText('Attack Discovery Example Generation')).not.toBeInTheDocument();
      });
    });
  });

  describe('Existing Functionality', () => {
    it('maintains existing evaluation functionality', () => {
      render(
        <IntlProvider locale="en">
          <EvaluationSettings />
        </IntlProvider>
      );

      expect(screen.getByText('Connectors / Models')).toBeInTheDocument();
      expect(screen.getByText('Graphs')).toBeInTheDocument();
      expect(screen.getByText('LangSmith Dataset')).toBeInTheDocument();
    });

    it('does not interfere with perform evaluation', () => {
      const mockPerformEvaluation = jest.fn();
      mockUsePerformEvaluation.mockReturnValue({
        mutate: mockPerformEvaluation,
        isLoading: false,
      });

      render(
        <IntlProvider locale="en">
          <EvaluationSettings />
        </IntlProvider>
      );

      const performButton = screen.getByText('Perform evaluation...');
      expect(performButton).toBeDisabled();
    });
  });
});
