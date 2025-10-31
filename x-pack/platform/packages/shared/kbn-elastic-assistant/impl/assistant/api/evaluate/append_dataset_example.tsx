/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup, IHttpFetchError } from '@kbn/core-http-browser';
import type {
  AppendDatasetExampleRequestBody,
  AppendDatasetExampleResponse,
} from '@kbn/elastic-assistant-common';
import {
  API_VERSIONS,
  ELASTIC_AI_ASSISTANT_EVALUATE_APPEND_DATASET_EXAMPLE_URL,
} from '@kbn/elastic-assistant-common';

export interface AppendDatasetExampleParams {
  datasetName: string;
  exampleName: string;
  http: HttpSetup;
  langSmithApiKey?: string;
  signal?: AbortSignal | undefined;
  sourceDatasetName: string;
  sourceExampleId: string;
  updatedAlerts: AppendDatasetExampleRequestBody['updatedAlerts'];
}

export const appendDatasetExample = async ({
  datasetName,
  exampleName,
  http,
  langSmithApiKey,
  signal,
  sourceDatasetName,
  sourceExampleId,
  updatedAlerts,
}: AppendDatasetExampleParams): Promise<AppendDatasetExampleResponse | IHttpFetchError> => {
  try {
    const path = ELASTIC_AI_ASSISTANT_EVALUATE_APPEND_DATASET_EXAMPLE_URL.replace(
      '{datasetName}',
      encodeURIComponent(datasetName)
    );

    return await http.post<AppendDatasetExampleResponse>(path, {
      body: JSON.stringify({
        exampleName,
        langSmithApiKey,
        sourceDatasetName,
        sourceExampleId,
        updatedAlerts,
      }),
      signal,
      version: API_VERSIONS.internal.v1,
    });
  } catch (error) {
    return error as IHttpFetchError;
  }
};
