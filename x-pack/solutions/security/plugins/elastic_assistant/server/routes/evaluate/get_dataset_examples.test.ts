/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import { defaultAssistantFeatures } from '@kbn/elastic-assistant-common';
import type { Example } from 'langsmith';

import { throwIfEvaluateAnonymizationFieldsDisabled } from './helpers/throw_if_evaluate_anonymization_fields_disabled';
import { getDatasetExamplesRoute } from './get_dataset_examples';
import { requestMock } from '../../__mocks__/request';
import { requestContextMock } from '../../__mocks__/request_context';
import { serverMock } from '../../__mocks__/server';
import * as utils from './utils';

jest.mock('./utils');
jest.mock('./helpers/throw_if_evaluate_anonymization_fields_disabled');

const mockFetchLangSmithDataset = utils.fetchLangSmithDataset as jest.Mock;
const mockThrowIfEvaluateAnonymizationFieldsDisabled =
  throwIfEvaluateAnonymizationFieldsDisabled as jest.Mock;

describe('Get Dataset Examples Route', () => {
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

  const mockExamples: Example[] = [
    {
      created_at: '2024-10-10T00:00:00.000Z',
      id: 'example-1',
      inputs: {
        anonymizedAlerts: [
          {
            metadata: {},
            pageContent: 'alert content 1',
          },
        ],
      },
      metadata: {
        customField: 'value1',
        name: 'Example 1',
      },
      modified_at: '2024-10-11T00:00:00.000Z',
      outputs: {
        attackDiscoveries: [],
      },
    } as unknown as Example,
    {
      created_at: '2024-10-12T00:00:00.000Z',
      id: 'example-2',
      inputs: {
        anonymizedAlerts: [
          {
            metadata: {},
            pageContent: 'alert content 2',
          },
        ],
      },
      metadata: {
        name: 'Example 2',
      },
      modified_at: '2024-10-13T00:00:00.000Z',
      outputs: {
        attackDiscoveries: [],
      },
    } as unknown as Example,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    context.elasticAssistant.getCurrentUser.mockResolvedValue(mockUser);
    context.elasticAssistant.getRegisteredFeatures.mockReturnValue({
      ...defaultAssistantFeatures,
      assistantModelEvaluation: true,
    });
    mockFetchLangSmithDataset.mockResolvedValue(mockExamples);
    mockThrowIfEvaluateAnonymizationFieldsDisabled.mockResolvedValue(undefined);

    getDatasetExamplesRoute(server.router);
  });

  describe('Feature Flag', () => {
    it('returns 403 when evaluate anonymization fields feature is disabled', async () => {
      mockThrowIfEvaluateAnonymizationFieldsDisabled.mockRejectedValueOnce(
        Object.assign(new Error('Evaluate anonymization fields feature is disabled'), {
          statusCode: 403,
        })
      );

      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toBe(403);
    });
  });

  describe('Capabilities', () => {
    it('returns 404 when evaluate feature is not registered', async () => {
      context.elasticAssistant.getRegisteredFeatures.mockReturnValueOnce({
        ...defaultAssistantFeatures,
        assistantModelEvaluation: false,
      });

      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(404);
    });
  });

  describe('Successful example retrieval', () => {
    it('returns success response with dataset name', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.datasetName).toEqual('test-dataset');
    });

    it('returns success response with examples array', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples).toHaveLength(2);
    });

    it('returns 200 status code', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(200);
    });

    it('calls fetchLangSmithDataset with dataset name', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(mockFetchLangSmithDataset).toHaveBeenCalledWith(
        'test-dataset',
        expect.any(Object),
        undefined
      );
    });

    it('calls fetchLangSmithDataset with API key when provided', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
        query: {
          langSmithApiKey: 'test-api-key',
        },
      });

      await server.inject(request, requestContextMock.convertContext(context));

      expect(mockFetchLangSmithDataset).toHaveBeenCalledWith(
        'test-dataset',
        expect.any(Object),
        'test-api-key'
      );
    });
  });

  describe('Example mapping', () => {
    it('maps created_at field correctly', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples[0].created_at).toEqual('2024-10-10T00:00:00.000Z');
    });

    it('maps id field correctly', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples[0].id).toEqual('example-1');
    });

    it('maps inputs field correctly', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples[0].inputs).toEqual({
        anonymizedAlerts: [
          {
            metadata: {},
            pageContent: 'alert content 1',
          },
        ],
      });
    });

    it('maps metadata field correctly', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples[0].metadata).toEqual({
        customField: 'value1',
        name: 'Example 1',
      });
    });

    it('maps modified_at field correctly', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples[0].modified_at).toEqual('2024-10-11T00:00:00.000Z');
    });

    it('maps name field from metadata correctly', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples[0].name).toEqual('Example 1');
    });

    it('maps outputs field correctly', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples[0].outputs).toEqual({
        attackDiscoveries: [],
      });
    });

    it('handles missing name in metadata', async () => {
      const examplesWithoutName: Example[] = [
        {
          created_at: '2024-10-10T00:00:00.000Z',
          id: 'example-1',
          inputs: {},
          metadata: {},
          modified_at: '2024-10-11T00:00:00.000Z',
          outputs: {},
        } as unknown as Example,
      ];

      mockFetchLangSmithDataset.mockResolvedValue(examplesWithoutName);

      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples[0].name).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('returns 500 when fetchLangSmithDataset fails', async () => {
      mockFetchLangSmithDataset.mockRejectedValue(new Error('LangSmith API error'));

      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(500);
    });

    it('returns error message when fetchLangSmithDataset fails', async () => {
      mockFetchLangSmithDataset.mockRejectedValue(new Error('LangSmith API error'));

      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body).toEqual({
        message: {
          error: 'LangSmith API error',
          success: false,
        },
        status_code: 500,
      });
    });

    it('returns error with custom status code when provided', async () => {
      mockFetchLangSmithDataset.mockRejectedValue(
        Object.assign(new Error('Not found'), {
          statusCode: 404,
        })
      );

      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'test-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/test-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(404);
    });
  });

  describe('Request validation', () => {
    it('validates datasetName parameter is required', async () => {
      const request = requestMock.create({
        method: 'get',
        params: {},
        path: '/internal/elastic_assistant/evaluate/dataset/examples',
      });

      await expect(
        server.inject(request, requestContextMock.convertContext(context))
      ).rejects.toThrow('datasetName: Required');
    });
  });

  describe('Empty results', () => {
    it('returns empty examples array when no examples exist', async () => {
      mockFetchLangSmithDataset.mockResolvedValue([]);

      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'empty-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/empty-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.body.examples).toEqual([]);
    });

    it('returns 200 status when no examples exist', async () => {
      mockFetchLangSmithDataset.mockResolvedValue([]);

      const request = requestMock.create({
        method: 'get',
        params: {
          datasetName: 'empty-dataset',
        },
        path: '/internal/elastic_assistant/evaluate/dataset/empty-dataset/examples',
      });

      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(200);
    });
  });
});
