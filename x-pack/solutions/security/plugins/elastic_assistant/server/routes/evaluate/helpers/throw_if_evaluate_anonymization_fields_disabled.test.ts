/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getKibanaFeatureFlags } from '../../attack_discovery/helpers/get_kibana_feature_flags';
import { throwIfEvaluateAnonymizationFieldsDisabled } from './throw_if_evaluate_anonymization_fields_disabled';
import type { ElasticAssistantRequestHandlerContext } from '../../../types';

jest.mock('../../attack_discovery/helpers/get_kibana_feature_flags');

const mockGetKibanaFeatureFlags = getKibanaFeatureFlags as jest.MockedFunction<
  typeof getKibanaFeatureFlags
>;

describe('throwIfEvaluateAnonymizationFieldsDisabled', () => {
  let contextMock: ElasticAssistantRequestHandlerContext;

  beforeEach(() => {
    contextMock = {
      core: Promise.resolve({
        featureFlags: {
          getBooleanValue: jest.fn(),
        },
      }),
    } as unknown as ElasticAssistantRequestHandlerContext;

    jest.clearAllMocks();
  });

  describe('when the evaluate anonymization fields feature is enabled', () => {
    beforeEach(() => {
      mockGetKibanaFeatureFlags.mockResolvedValue({
        attackDiscoveryPublicApiEnabled: true,
        evaluateAnonymizationFields: true,
      });
    });

    it('does NOT throw an error', async () => {
      await expect(throwIfEvaluateAnonymizationFieldsDisabled(contextMock)).resolves.not.toThrow();
    });
  });

  describe('when the evaluate anonymization fields feature is disabled', () => {
    beforeEach(() => {
      mockGetKibanaFeatureFlags.mockResolvedValue({
        attackDiscoveryPublicApiEnabled: true,
        evaluateAnonymizationFields: false,
      });
    });

    it('throws an error with the correct message', async () => {
      await expect(throwIfEvaluateAnonymizationFieldsDisabled(contextMock)).rejects.toThrow(
        'Evaluate anonymization fields feature is disabled'
      );
    });

    it('throws an error with statusCode 403', async () => {
      try {
        await throwIfEvaluateAnonymizationFieldsDisabled(contextMock);
      } catch (error) {
        expect(error).toHaveProperty('statusCode', 403);
      }
    });

    it('throws an Error instance', async () => {
      try {
        await throwIfEvaluateAnonymizationFieldsDisabled(contextMock);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('error handling', () => {
    it('propagates errors from getKibanaFeatureFlags', async () => {
      const originalError = new Error('Feature flags service error');

      mockGetKibanaFeatureFlags.mockRejectedValue(originalError);

      await expect(throwIfEvaluateAnonymizationFieldsDisabled(contextMock)).rejects.toThrow(
        'Feature flags service error'
      );
    });
  });
});
