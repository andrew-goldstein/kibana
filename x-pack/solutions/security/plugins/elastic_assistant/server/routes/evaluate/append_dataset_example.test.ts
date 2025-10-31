/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { appendDatasetExampleRoute } from './append_dataset_example';
import { serverMock } from '../../__mocks__/server';
import { requestContextMock } from '../../__mocks__/request_context';
import { requestMock } from '../../__mocks__/request';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { defaultAssistantFeatures } from '@kbn/elastic-assistant-common';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import * as utils from './utils';
import { Client } from 'langsmith';
import { throwIfEvaluateAnonymizationFieldsDisabled } from './helpers/throw_if_evaluate_anonymization_fields_disabled';

jest.mock('./utils');
jest.mock('langsmith');
jest.mock('./helpers/throw_if_evaluate_anonymization_fields_disabled');

const mockFetchLangSmithDataset = utils.fetchLangSmithDataset as jest.Mock;
const MockClient = Client as jest.MockedClass<typeof Client>;
const mockThrowIfEvaluateAnonymizationFieldsDisabled =
  throwIfEvaluateAnonymizationFieldsDisabled as jest.Mock;

describe('Append Dataset Example Route', () => {
  const { clients, context } = requestContextMock.createTools();
  const server: ReturnType<typeof serverMock.create> = serverMock.create();
  clients.core.elasticsearch.client = elasticsearchServiceMock.createScopedClusterClient();

  const mockUser = {
    authentication_realm: {
      name: 'my_realm_name',
      type: 'my_realm_type',
    },
    username: 'elastic',
  } as AuthenticatedUser;

  const mockSourceExample = {
    created_at: '2024-10-10T00:00:00.000Z',
    id: 'source-example-id',
    inputs: {
      anonymizedAlerts: [
        {
          metadata: {},
          pageContent: '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123\nhost.name,hostname',
        },
      ],
      replacements: { original: 'anonymized' },
    },
    metadata: {
      name: 'Original Example',
    },
    name: 'Original Example',
    outputs: {
      attackDiscoveries: [],
      insights: [],
    },
  };

  const mockUpdatedAlerts = [
    {
      metadata: {},
      pageContent:
        '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123\nhost.name,hostname\ncontainer.id,container123',
    },
    {
      metadata: {},
      pageContent: 'user.name,testuser\nprocess.name,test.exe\nservice.name,my-service',
    },
  ];

  const mockCreateExample = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    context.elasticAssistant.getCurrentUser.mockResolvedValue(mockUser);
    context.elasticAssistant.getRegisteredFeatures.mockReturnValue({
      ...defaultAssistantFeatures,
      assistantModelEvaluation: true,
    });
    mockFetchLangSmithDataset.mockResolvedValue([mockSourceExample]);
    mockThrowIfEvaluateAnonymizationFieldsDisabled.mockResolvedValue(undefined);

    MockClient.mockImplementation(
      () =>
        ({
          createExample: mockCreateExample,
        } as unknown as Client)
    );

    mockCreateExample.mockResolvedValue({
      id: 'new-example-id',
    });

    appendDatasetExampleRoute(server.router);
  });

  describe('Feature Flag', () => {
    describe('when evaluate anonymization fields feature is disabled', () => {
      const defaultProps = {
        body: {
          exampleName: 'New Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post' as const,
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      };

      beforeEach(() => {
        mockThrowIfEvaluateAnonymizationFieldsDisabled.mockRejectedValueOnce(
          Object.assign(new Error('Evaluate anonymization fields feature is disabled'), {
            statusCode: 403,
          })
        );
      });

      it('returns 403 status', async () => {
        const request = requestMock.create(defaultProps);

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toBe(403);
      });

      it('returns error message in body', async () => {
        const request = requestMock.create(defaultProps);

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.body).toEqual({
          message: {
            error: 'Evaluate anonymization fields feature is disabled',
            success: false,
          },
          status_code: 403,
        });
      });
    });
  });

  describe('Capabilities', () => {
    it('returns a 404 if evaluate feature is not registered', async () => {
      context.elasticAssistant.getRegisteredFeatures.mockReturnValueOnce({
        ...defaultAssistantFeatures,
        assistantModelEvaluation: false,
      });

      const request = requestMock.create({
        body: {
          exampleName: 'New Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(404);
    });
  });

  describe('Successful example append', () => {
    const defaultProps = {
      body: {
        exampleName: 'New Example',
        sourceDatasetName: 'source-dataset',
        sourceExampleId: 'source-example-id',
        updatedAlerts: mockUpdatedAlerts,
      },
      method: 'post' as const,
      params: {
        datasetName: 'test-dataset',
      },
      path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
    };

    it('returns 200 status', async () => {
      const request = requestMock.create(defaultProps);

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(200);
    });

    it('returns success response with new example ID', async () => {
      const request = requestMock.create(defaultProps);

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body).toEqual({
        exampleId: 'new-example-id',
        success: true,
      });
    });

    it('calls fetchLangSmithDataset with correct source dataset name', async () => {
      const request = requestMock.create(defaultProps);

      await server.inject(request, requestContextMock.convertContext(context));

      expect(mockFetchLangSmithDataset).toHaveBeenCalledWith(
        'source-dataset',
        expect.any(Object),
        undefined
      );
    });

    it('calls LangSmith createExample with correct parameters', async () => {
      const request = requestMock.create(defaultProps);

      await server.inject(request, requestContextMock.convertContext(context));

      expect(mockCreateExample).toHaveBeenCalledWith({
        dataset_name: 'test-dataset',
        inputs: {
          anonymizedAlerts: mockUpdatedAlerts,
          replacements: { original: 'anonymized' },
        },
        metadata: {
          name: 'New Example',
        },
        outputs: {
          attackDiscoveries: [],
          insights: [],
        },
      });
    });
  });

  describe('Example cloning preserves properties', () => {
    it('preserves all input properties except alerts', async () => {
      const complexSourceExample = {
        ...mockSourceExample,
        inputs: {
          anonymizedAlerts: [
            {
              metadata: {},
              pageContent: 'old,content',
            },
          ],
          attackDiscoveryPrompt: 'custom prompt',
          combinedGenerations: 'generation text',
          combinedRefinements: 'refinement text',
          errors: ['error1', 'error2'],
          generationAttempts: 3,
          generations: ['gen1', 'gen2'],
          hallucinationFailures: 1,
          maxGenerationAttempts: 5,
          maxHallucinationFailures: 2,
          maxRepeatedGenerations: 3,
          refinements: ['ref1', 'ref2'],
          refinePrompt: 'refine prompt',
          replacements: { key: 'value' },
          unrefinedResults: null,
        },
      };

      mockFetchLangSmithDataset.mockResolvedValue([complexSourceExample]);

      const request = requestMock.create({
        body: {
          exampleName: 'Complex Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(mockCreateExample).toHaveBeenCalledWith({
        dataset_name: 'test-dataset',
        inputs: {
          anonymizedAlerts: mockUpdatedAlerts,
          attackDiscoveryPrompt: 'custom prompt',
          combinedGenerations: 'generation text',
          combinedRefinements: 'refinement text',
          errors: ['error1', 'error2'],
          generationAttempts: 3,
          generations: ['gen1', 'gen2'],
          hallucinationFailures: 1,
          maxGenerationAttempts: 5,
          maxHallucinationFailures: 2,
          maxRepeatedGenerations: 3,
          refinements: ['ref1', 'ref2'],
          refinePrompt: 'refine prompt',
          replacements: { key: 'value' },
          unrefinedResults: null,
        },
        metadata: {
          name: 'Complex Example',
        },
        outputs: complexSourceExample.outputs,
      });
    });

    it('preserves outputs unchanged', async () => {
      const exampleWithOutputs = {
        ...mockSourceExample,
        outputs: {
          attackDiscoveries: [{ id: 'discovery1' }],
          insights: [{ id: 'insight1' }],
          otherField: 'value',
        },
      };

      mockFetchLangSmithDataset.mockResolvedValue([exampleWithOutputs]);

      const request = requestMock.create({
        body: {
          exampleName: 'New Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(mockCreateExample).toHaveBeenCalledWith(
        expect.objectContaining({
          outputs: exampleWithOutputs.outputs,
        })
      );
    });

    it('preserves metadata structure', async () => {
      const exampleWithMetadata = {
        ...mockSourceExample,
        metadata: {
          customField1: 'value1',
          customField2: 123,
          name: 'Original',
          nested: {
            field: 'value',
          },
        },
      };

      mockFetchLangSmithDataset.mockResolvedValue([exampleWithMetadata]);

      const request = requestMock.create({
        body: {
          exampleName: 'Updated Name',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(mockCreateExample).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            customField1: 'value1',
            customField2: 123,
            name: 'Updated Name',
            nested: {
              field: 'value',
            },
          },
        })
      );
    });
  });

  describe('Error handling', () => {
    describe('when source example is not found', () => {
      const defaultProps = {
        body: {
          exampleName: 'New Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'non-existent-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post' as const,
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      };

      beforeEach(() => {
        mockFetchLangSmithDataset.mockResolvedValue([]);
      });

      it('returns 404 status', async () => {
        const request = requestMock.create(defaultProps);

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(404);
      });

      it('returns error message in body', async () => {
        const request = requestMock.create(defaultProps);

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.body).toEqual({
          message: {
            error: 'Source example with ID non-existent-id not found in dataset source-dataset',
          },
          status_code: 404,
        });
      });
    });

    describe('when fetchLangSmithDataset fails', () => {
      const defaultProps = {
        body: {
          exampleName: 'New Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post' as const,
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      };

      beforeEach(() => {
        mockFetchLangSmithDataset.mockRejectedValue(new Error('LangSmith API error'));
      });

      it('returns 500 status', async () => {
        const request = requestMock.create(defaultProps);

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(500);
      });

      it('returns error message in body', async () => {
        const request = requestMock.create(defaultProps);

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.body).toEqual({
          message: {
            error: 'LangSmith API error',
            success: false,
          },
          status_code: 500,
        });
      });
    });

    describe('when LangSmith createExample fails', () => {
      const defaultProps = {
        body: {
          exampleName: 'New Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post' as const,
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      };

      beforeEach(() => {
        mockCreateExample.mockRejectedValue(new Error('Failed to create example'));
      });

      it('returns 500 status', async () => {
        const request = requestMock.create(defaultProps);

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(500);
      });

      it('returns error message in body', async () => {
        const request = requestMock.create(defaultProps);

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.body).toEqual({
          message: {
            error: 'Failed to create example',
            success: false,
          },
          status_code: 500,
        });
      });
    });
  });

  describe('Request validation', () => {
    it('validates required fields in request body', async () => {
      const request = requestMock.create({
        body: {
          exampleName: 'New Example',
          // missing sourceDatasetName, sourceExampleId and updatedAlerts
        },
        method: 'post',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      });

      await expect(
        server.inject(request, requestContextMock.convertContext(context))
      ).rejects.toThrow('sourceDatasetName: Required');
    });

    it('validates datasetName parameter', async () => {
      const request = requestMock.create({
        body: {
          exampleName: 'New Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: mockUpdatedAlerts,
        },
        method: 'post',
        params: {},
        path: '/internal/elastic_assistant/evaluate/dataset/examples/_append',
      });

      await expect(
        server.inject(request, requestContextMock.convertContext(context))
      ).rejects.toThrow('datasetName: Required');
    });

    it('validates updatedAlerts array structure', async () => {
      const request = requestMock.create({
        body: {
          exampleName: 'New Example',
          sourceDatasetName: 'source-dataset',
          sourceExampleId: 'source-example-id',
          updatedAlerts: [
            {
              // missing pageContent
              metadata: {},
            },
          ],
        },
        method: 'post',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples/_append',
      });

      await expect(
        server.inject(request, requestContextMock.convertContext(context))
      ).rejects.toThrow('pageContent: Required');
    });
  });
});
