/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';
import type { HttpSetup, IHttpFetchError, ResponseErrorBody } from '@kbn/core-http-browser';
import type { IToasts } from '@kbn/core-notifications-browser';
import { i18n } from '@kbn/i18n';
import type { AppendDatasetExampleRequestBody } from '@kbn/elastic-assistant-common';
import { appendDatasetExample } from './append_dataset_example';

export interface UseAppendDatasetExampleParams {
  http: HttpSetup;
  langSmithApiKey?: string;
  toasts?: IToasts;
}

export interface AppendDatasetExampleMutationParams {
  datasetName: string;
  exampleName: string;
  sourceDatasetName: string;
  sourceExampleId: string;
  updatedAlerts: AppendDatasetExampleRequestBody['updatedAlerts'];
}

/**
 * Hook for appending a new example to a specific dataset
 *
 * @param {Object} options - The options object.
 * @param {HttpSetup} options.http - HttpSetup
 * @param {string} [options.langSmithApiKey] - Optional LangSmith API key for authentication
 * @param {IToasts} [options.toasts] - IToasts
 *
 * @returns {useMutation} mutation hook for appending dataset example
 */
export const useAppendDatasetExample = ({
  http,
  langSmithApiKey,
  toasts,
}: UseAppendDatasetExampleParams) => {
  return useMutation({
    mutationFn: async ({
      datasetName,
      exampleName,
      sourceDatasetName,
      sourceExampleId,
      updatedAlerts,
    }: AppendDatasetExampleMutationParams) => {
      return appendDatasetExample({
        datasetName,
        exampleName,
        http,
        langSmithApiKey,
        sourceDatasetName,
        sourceExampleId,
        updatedAlerts,
      });
    },
    onError: (error: IHttpFetchError<ResponseErrorBody>) => {
      if (error.name !== 'AbortError') {
        toasts?.addError(error.body && error.body.message ? new Error(error.body.message) : error, {
          title: i18n.translate('xpack.elasticAssistant.evaluation.appendDatasetExampleError', {
            defaultMessage: 'Error appending example to dataset...',
          }),
        });
      }
    },
  });
};
