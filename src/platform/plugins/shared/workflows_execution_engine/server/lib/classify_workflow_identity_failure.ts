/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Boom from '@hapi/boom';

/**
 * Closed set of reasons a run's service account could not be used before its first step. Telemetry
 * sends the reason instead of the raw error message, which can name the service account.
 */
export const WORKFLOW_IDENTITY_FAILURE_REASONS = [
  /** Service account execution is turned off (`xpack.security.serviceAccounts.enabled`). */
  'service_accounts_disabled',
  /** A 404 from the workload binding API: no service account is bound to the workflow. */
  'service_account_binding_missing',
  /** A 403: the binding names a different account, failed verification, or can't be used. */
  'service_account_binding_refused',
  /**
   * The token exchange failed and the security plugin won't retry it (`retryable: false`): the
   * stored credential is missing (the account was deleted), the account was deleted and created
   * again, the credential is inconsistent, or Elasticsearch or UIAM refused it.
   */
  'service_account_token_exchange_rejected',
  /**
   * The token exchange failed in a way the security plugin would retry (`retryable: true`): a
   * connection error or timeout, a 408, 429 or 5xx.
   */
  'service_account_token_exchange_unavailable',
  /** Anything else, for example an invalid service account id, or an exchange error without a `retryable` flag. */
  'other_service_account_error',
] as const;

export type WorkflowIdentityFailureReason = (typeof WORKFLOW_IDENTITY_FAILURE_REASONS)[number];

/**
 * Name the security plugin gives the error that wraps a failed token exchange
 * (`ServiceAccountTokenExchangeError`). The engine can't import that class, so it matches the name.
 */
export const SERVICE_ACCOUNT_TOKEN_EXCHANGE_ERROR_NAME = 'ServiceAccountTokenExchangeError';

const isTokenExchangeError = (error: unknown): error is Error & { retryable?: unknown } =>
  error instanceof Error && error.name === SERVICE_ACCOUNT_TOKEN_EXCHANGE_ERROR_NAME;

const classifyTokenExchangeError = ({
  retryable,
}: Error & { retryable?: unknown }): WorkflowIdentityFailureReason => {
  if (retryable === false) {
    return 'service_account_token_exchange_rejected';
  }
  if (retryable === true) {
    return 'service_account_token_exchange_unavailable';
  }
  return 'other_service_account_error';
};

const getBoomStatusCode = (error: unknown): number | undefined =>
  Boom.isBoom(error) ? error.output.statusCode : undefined;

/**
 * Maps an identity failure to its reason, from the service account switch, the token exchange
 * wrapper's `retryable` flag, and the HTTP status the workload binding API documents (404 no
 * binding, 403 refused).
 */
export const classifyWorkflowIdentityFailure = ({
  error,
  serviceAccountsEnabled,
}: {
  error: unknown;
  serviceAccountsEnabled: boolean;
}): WorkflowIdentityFailureReason => {
  if (!serviceAccountsEnabled) {
    return 'service_accounts_disabled';
  }
  if (isTokenExchangeError(error)) {
    return classifyTokenExchangeError(error);
  }

  const statusCode = getBoomStatusCode(error);
  if (statusCode === 404) {
    return 'service_account_binding_missing';
  }
  if (statusCode === 403) {
    return 'service_account_binding_refused';
  }

  return 'other_service_account_error';
};
