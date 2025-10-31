/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import type { HttpSetup, IHttpFetchError, ResponseErrorBody } from '@kbn/core-http-browser';
import type { IToasts } from '@kbn/core-notifications-browser';
import { i18n } from '@kbn/i18n';
import { getDatasetExamples } from './get_dataset_examples';

export interface UseDatasetExamplesParams {
  datasetName: string;
  enabled?: boolean;
  http: HttpSetup;
  langSmithApiKey?: string;
  toasts?: IToasts;
}

/**
 * Hook for fetching examples from a specific dataset
 *
 * @param {Object} options - The options object.
 * @param {string} options.datasetName - The name of the dataset to fetch examples from
 * @param {boolean} [options.enabled] - Whether the query should be enabled (default: true)
 * @param {HttpSetup} options.http - HttpSetup
 * @param {string} [options.langSmithApiKey] - Optional LangSmith API key for authentication
 * @param {IToasts} [options.toasts] - IToasts
 *
 * @returns {useQuery} query hook for fetching dataset examples
 */
export const useDatasetExamples = ({
  datasetName,
  enabled = true,
  http,
  langSmithApiKey,
  toasts,
}: UseDatasetExamplesParams) => {
  return useQuery({
    queryKey: ['elastic-assistant', 'dataset-examples', datasetName, langSmithApiKey],
    queryFn: ({ signal }) => {
      return getDatasetExamples({ datasetName, http, langSmithApiKey, signal });
    },
    enabled: enabled && !!datasetName,
    retry: false,
    keepPreviousData: true,
    // Deprecated, hoist to `queryCache` w/in `QueryClient. See: https://stackoverflow.com/a/76961109
    onError: (error: IHttpFetchError<ResponseErrorBody>) => {
      if (error.name !== 'AbortError') {
        toasts?.addError(error.body && error.body.message ? new Error(error.body.message) : error, {
          title: i18n.translate('xpack.elasticAssistant.evaluation.fetchDatasetExamplesError', {
            defaultMessage: 'Error fetching dataset examples...',
          }),
        });
      }
    },
  });
};
