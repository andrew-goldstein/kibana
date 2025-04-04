/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import {
  catchRetryableEsClientErrors,
  catchRetryableSearchPhaseExecutionException,
} from './catch_retryable_es_client_errors';

describe('catchRetryableEsClientErrors', () => {
  it('rejects non-retryable response errors', async () => {
    const error = new esErrors.ResponseError(
      elasticsearchClientMock.createApiResponse({
        body: { error: { type: 'cluster_block_exception' } },
        statusCode: 400,
      })
    );
    await expect(Promise.reject(error).catch(catchRetryableEsClientErrors)).rejects.toBe(error);
  });
  describe('returns left retryable_es_client_error for', () => {
    it('NoLivingConnectionsError', async () => {
      const error = new esErrors.NoLivingConnectionsError(
        'reason',
        elasticsearchClientMock.createApiResponse()
      );
      expect(
        ((await Promise.reject(error).catch(catchRetryableEsClientErrors)) as any).left
      ).toMatchObject({
        message: 'reason',
        type: 'retryable_es_client_error',
      });
    });

    it('ConnectionError', async () => {
      const error = new esErrors.ConnectionError(
        'reason',
        elasticsearchClientMock.createApiResponse()
      );
      expect(
        ((await Promise.reject(error).catch(catchRetryableEsClientErrors)) as any).left
      ).toMatchObject({
        message: 'reason',
        type: 'retryable_es_client_error',
      });
    });
    it('TimeoutError', async () => {
      const error = new esErrors.TimeoutError(
        'reason',
        elasticsearchClientMock.createApiResponse()
      );
      expect(
        ((await Promise.reject(error).catch(catchRetryableEsClientErrors)) as any).left
      ).toMatchObject({
        message: 'reason',
        type: 'retryable_es_client_error',
      });
    });
    it('ResponseError of type snapshot_in_progress_exception', async () => {
      const error = new esErrors.ResponseError(
        elasticsearchClientMock.createApiResponse({
          body: { error: { type: 'snapshot_in_progress_exception' } },
        })
      );
      expect(
        ((await Promise.reject(error).catch(catchRetryableEsClientErrors)) as any).left
      ).toMatchObject({
        message: 'snapshot_in_progress_exception',
        type: 'retryable_es_client_error',
      });
    });
    it.each([503, 401, 403, 408, 410, 429])(
      'ResponseError with retryable status code (%d)',
      async (status) => {
        const error = new esErrors.ResponseError(
          elasticsearchClientMock.createApiResponse({
            statusCode: status,
            body: { error: { type: 'reason' } },
          })
        );
        expect(
          ((await Promise.reject(error).catch(catchRetryableEsClientErrors)) as any).left
        ).toMatchObject({
          message:
            status === 410
              ? 'This API is unavailable in the version of Elasticsearch you are using.'
              : 'reason',
          type: 'retryable_es_client_error',
        });
      }
    );
  });
});

describe('catchRetryableSearchPhaseExecutionException', () => {
  it('retries search phase execution exception ', async () => {
    const error = new esErrors.ResponseError(
      elasticsearchClientMock.createApiResponse({
        body: { error: { type: 'search_phase_execution_exception' } },
      })
    );
    expect(
      ((await Promise.reject(error).catch(catchRetryableSearchPhaseExecutionException)) as any).left
    ).toMatchObject({
      message: 'search_phase_execution_exception',
      type: 'retryable_es_client_error',
    });
  });
  it('does not retry other errors', async () => {
    const error = new esErrors.ResponseError(
      elasticsearchClientMock.createApiResponse({
        body: { error: { type: 'cluster_block_exception' } },
      })
    );
    await expect(
      Promise.reject(error).catch(catchRetryableSearchPhaseExecutionException)
    ).rejects.toBe(error);
  });
});
