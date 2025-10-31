/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, IKibanaResponse } from '@kbn/core/server';
import { transformError } from '@kbn/securitysolution-es-utils';
import {
  API_VERSIONS,
  ELASTIC_AI_ASSISTANT_EVALUATE_DATASET_EXAMPLES_URL,
  GetDatasetExamplesRequestParams,
  GetDatasetExamplesRequestQuery,
  GetDatasetExamplesResponse,
  INTERNAL_API_ACCESS,
} from '@kbn/elastic-assistant-common';
import { buildRouteValidationWithZod } from '@kbn/elastic-assistant-common/impl/schemas/common';
import type { Example } from 'langsmith';

import { throwIfEvaluateAnonymizationFieldsDisabled } from './helpers/throw_if_evaluate_anonymization_fields_disabled';
import { performChecks } from '../helpers';
import { buildResponse } from '../../lib/build_response';
import type { ElasticAssistantRequestHandlerContext } from '../../types';
import { fetchLangSmithDataset } from './utils';

export const getDatasetExamplesRoute = (router: IRouter<ElasticAssistantRequestHandlerContext>) => {
  router.versioned
    .get({
      access: INTERNAL_API_ACCESS,
      path: ELASTIC_AI_ASSISTANT_EVALUATE_DATASET_EXAMPLES_URL,
      security: {
        authz: {
          requiredPrivileges: ['elasticAssistant'],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetDatasetExamplesRequestParams),
            query: buildRouteValidationWithZod(GetDatasetExamplesRequestQuery),
          },
          response: {
            200: {
              body: { custom: buildRouteValidationWithZod(GetDatasetExamplesResponse) },
            },
          },
        },
      },
      async (context, request, response): Promise<IKibanaResponse<GetDatasetExamplesResponse>> => {
        const ctx = await context.resolve(['core', 'elasticAssistant', 'licensing']);
        const assistantContext = ctx.elasticAssistant;
        const logger = assistantContext.logger.get('evaluate');

        // Perform license, authenticated user and evaluation FF checks
        const checkResponse = await performChecks({
          capability: 'assistantModelEvaluation',
          context: ctx,
          request,
          response,
        });

        if (!checkResponse.isSuccess) {
          return checkResponse.response;
        }

        const { datasetName } = request.params;
        const { langSmithApiKey } = request.query;

        try {
          // Check if evaluate anonymization fields feature is enabled
          await throwIfEvaluateAnonymizationFieldsDisabled(context);

          const examples: Example[] = await fetchLangSmithDataset(
            datasetName,
            logger,
            langSmithApiKey
          );

          const responseBody: GetDatasetExamplesResponse = {
            datasetName,
            examples: examples.map((example) => ({
              created_at: example.created_at,
              id: example.id,
              inputs: example.inputs,
              metadata: example.metadata,
              modified_at: example.modified_at,
              name: example.metadata?.name as string | undefined,
              outputs: example.outputs,
            })),
          };

          return response.ok({
            body: responseBody,
          });
        } catch (err) {
          logger.error(`Error fetching dataset examples: ${err.message}`);
          const error = transformError(err);

          const resp = buildResponse(response);
          return resp.error({
            body: { error: error.message, success: false },
            statusCode: error.statusCode,
          });
        }
      }
    );
};
