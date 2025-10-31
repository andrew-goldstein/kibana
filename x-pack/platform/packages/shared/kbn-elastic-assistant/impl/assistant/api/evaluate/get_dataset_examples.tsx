/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup, IHttpFetchError } from '@kbn/core-http-browser';
import type { GetDatasetExamplesResponse } from '@kbn/elastic-assistant-common';
import {
  API_VERSIONS,
  ELASTIC_AI_ASSISTANT_EVALUATE_DATASET_EXAMPLES_URL,
} from '@kbn/elastic-assistant-common';

export interface GetDatasetExamplesParams {
  datasetName: string;
  http: HttpSetup;
  langSmithApiKey?: string;
  signal?: AbortSignal | undefined;
}

export const getDatasetExamples = async ({
  datasetName,
  http,
  langSmithApiKey,
  signal,
}: GetDatasetExamplesParams): Promise<GetDatasetExamplesResponse | IHttpFetchError> => {
  try {
    const path = ELASTIC_AI_ASSISTANT_EVALUATE_DATASET_EXAMPLES_URL.replace(
      '{datasetName}',
      encodeURIComponent(datasetName)
    );

    return await http.get<GetDatasetExamplesResponse>(path, {
      query: langSmithApiKey ? { langSmithApiKey } : undefined,
      signal,
      version: API_VERSIONS.internal.v1,
    });
  } catch (error) {
    return error as IHttpFetchError;
  }
};
