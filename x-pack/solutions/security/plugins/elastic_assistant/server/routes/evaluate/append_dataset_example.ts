/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, IKibanaResponse } from '@kbn/core/server';
import {
  API_VERSIONS,
  AppendDatasetExampleRequestBody,
  AppendDatasetExampleRequestParams,
  AppendDatasetExampleResponse,
  ELASTIC_AI_ASSISTANT_EVALUATE_APPEND_DATASET_EXAMPLE_URL,
  INTERNAL_API_ACCESS,
} from '@kbn/elastic-assistant-common';
import { buildRouteValidationWithZod } from '@kbn/elastic-assistant-common/impl/schemas/common';
import { transformError } from '@kbn/securitysolution-es-utils';
import { Client } from 'langsmith';

import { throwIfEvaluateAnonymizationFieldsDisabled } from './helpers/throw_if_evaluate_anonymization_fields_disabled';
import { performChecks } from '../helpers';
import { buildResponse } from '../../lib/build_response';
import type { ElasticAssistantRequestHandlerContext } from '../../types';
import { fetchLangSmithDataset } from './utils';

export const appendDatasetExampleRoute = (
  router: IRouter<ElasticAssistantRequestHandlerContext>
) => {
  router.versioned
    .post({
      access: INTERNAL_API_ACCESS,
      path: ELASTIC_AI_ASSISTANT_EVALUATE_APPEND_DATASET_EXAMPLE_URL,
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
            body: buildRouteValidationWithZod(AppendDatasetExampleRequestBody),
            params: buildRouteValidationWithZod(AppendDatasetExampleRequestParams),
          },
          response: {
            200: {
              body: { custom: buildRouteValidationWithZod(AppendDatasetExampleResponse) },
            },
          },
        },
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<AppendDatasetExampleResponse>> => {
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
        const { exampleName, langSmithApiKey, sourceDatasetName, sourceExampleId, updatedAlerts } =
          request.body;

        try {
          // Check if evaluate anonymization fields feature is enabled
          await throwIfEvaluateAnonymizationFieldsDisabled(context);

          // Fetch the source example from the SOURCE dataset
          const examples = await fetchLangSmithDataset(sourceDatasetName, logger, langSmithApiKey);
          const sourceExample = examples.find((ex) => ex.id === sourceExampleId);

          if (!sourceExample) {
            logger.error(`Source example not found: ${sourceExampleId}`);
            const error = transformError(
              new Error(
                `Source example with ID ${sourceExampleId} not found in dataset ${sourceDatasetName}`
              )
            );
            const resp = buildResponse(response);
            return resp.error({
              body: { error: error.message },
              statusCode: 404,
            });
          }

          // Clone the source example
          const clonedExample = {
            ...sourceExample,
            inputs: {
              ...sourceExample.inputs,
              anonymizedAlerts: updatedAlerts,
            },
          };

          // Create a new example in LangSmith using the LangSmith client
          const client = new Client(langSmithApiKey ? { apiKey: langSmithApiKey } : undefined);
          const newExample = await client.createExample({
            dataset_name: datasetName,
            inputs: clonedExample.inputs,
            outputs: clonedExample.outputs,
            metadata: {
              ...clonedExample.metadata,
              name: exampleName,
            },
          });

          logger.info(`Successfully appended example ${newExample.id} to dataset: ${datasetName}`);

          const responseBody: AppendDatasetExampleResponse = {
            exampleId: newExample.id,
            success: true,
          };

          return response.ok({
            body: responseBody,
          });
        } catch (err) {
          logger.error(`Error appending example to dataset: ${err.message}`);
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
