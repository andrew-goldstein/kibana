/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Boom from '@hapi/boom';
import {
  classifyWorkflowIdentityFailure,
  SERVICE_ACCOUNT_TOKEN_EXCHANGE_ERROR_NAME,
  WORKFLOW_IDENTITY_FAILURE_REASONS,
} from './classify_workflow_identity_failure';

/**
 * Same shape as the security plugin's `ServiceAccountTokenExchangeError`
 * (`x-pack/platform/plugins/shared/security/server/service_accounts/token_exchange_error.ts`),
 * which a platform plugin under `src/` can't import.
 */
class TokenExchangeErrorLikeSecurityPlugin extends Error {
  constructor(cause: Error, public readonly retryable: boolean, public readonly retryAfterMs = 0) {
    super('Error occurred during service account token exchange.', { cause });
    this.name = 'ServiceAccountTokenExchangeError';
  }
}

/**
 * How `exchangeToken` in `es_service_accounts.ts` rethrows a failure: a fresh cause, and the
 * `retryable` flag its retry policy computed. A missing stored credential (`Boom.notFound`) or an
 * inconsistent or recreated account (`Boom.forbidden`) is never retried, so it carries `false`; a
 * connection error, timeout, 408, 429 or 5xx carries `true`.
 */
const wrapLikeEsExchange = (retryable: boolean): TokenExchangeErrorLikeSecurityPlugin =>
  new TokenExchangeErrorLikeSecurityPlugin(
    new Error('Service account token exchange failed for [elastic/alertzero_secret].'),
    retryable,
    0
  );

describe('classifyWorkflowIdentityFailure', () => {
  it('reports disabled service accounts before looking at the error', () => {
    expect(
      classifyWorkflowIdentityFailure({
        error: wrapLikeEsExchange(false),
        serviceAccountsEnabled: false,
      })
    ).toBe('service_accounts_disabled');
  });

  it('maps a 404 from the binding API to a missing binding', () => {
    expect(
      classifyWorkflowIdentityFailure({
        error: Boom.notFound(
          'No service account is bound to workload [workflow/wf-1] of plugin [x].'
        ),
        serviceAccountsEnabled: true,
      })
    ).toBe('service_account_binding_missing');
  });

  it.each([
    'The workload binding does not match the expected service account.',
    'The service account binding for this workload failed integrity verification.',
    'Cannot use service account workload bindings: security features are disabled in Elasticsearch',
  ])('maps the 403 "%s" to a refused binding', (message) => {
    expect(
      classifyWorkflowIdentityFailure({
        error: Boom.forbidden(message),
        serviceAccountsEnabled: true,
      })
    ).toBe('service_account_binding_refused');
  });

  it('maps a non-retryable token exchange failure to a rejected exchange', () => {
    const error = wrapLikeEsExchange(false);

    expect(Boom.isBoom(error)).toBe(false);
    expect(error.name).toBe(SERVICE_ACCOUNT_TOKEN_EXCHANGE_ERROR_NAME);
    expect(classifyWorkflowIdentityFailure({ error, serviceAccountsEnabled: true })).toBe(
      'service_account_token_exchange_rejected'
    );
  });

  it('maps a retryable token exchange failure to an unavailable exchange', () => {
    expect(
      classifyWorkflowIdentityFailure({
        error: wrapLikeEsExchange(true),
        serviceAccountsEnabled: true,
      })
    ).toBe('service_account_token_exchange_unavailable');
  });

  it('maps a token exchange error without a retryable flag to other', () => {
    const error = Object.assign(
      new Error('Error occurred during service account token exchange.'),
      {
        name: SERVICE_ACCOUNT_TOKEN_EXCHANGE_ERROR_NAME,
      }
    );

    expect(classifyWorkflowIdentityFailure({ error, serviceAccountsEnabled: true })).toBe(
      'other_service_account_error'
    );
  });

  it.each([
    ['a plain error', new Error('Service accounts are not enabled')],
    ['another Boom status', Boom.badRequest('Invalid Elasticsearch service account ID.')],
    ['a non-error value', 'boom'],
  ])('maps %s to other', (_name, error) => {
    expect(classifyWorkflowIdentityFailure({ error, serviceAccountsEnabled: true })).toBe(
      'other_service_account_error'
    );
  });

  it('only returns values from the closed set', () => {
    const reasons = [
      classifyWorkflowIdentityFailure({ error: undefined, serviceAccountsEnabled: false }),
      classifyWorkflowIdentityFailure({ error: Boom.notFound(), serviceAccountsEnabled: true }),
      classifyWorkflowIdentityFailure({ error: Boom.forbidden(), serviceAccountsEnabled: true }),
      classifyWorkflowIdentityFailure({
        error: wrapLikeEsExchange(false),
        serviceAccountsEnabled: true,
      }),
      classifyWorkflowIdentityFailure({
        error: wrapLikeEsExchange(true),
        serviceAccountsEnabled: true,
      }),
      classifyWorkflowIdentityFailure({ error: new Error('x'), serviceAccountsEnabled: true }),
    ];

    expect(reasons).toEqual([...WORKFLOW_IDENTITY_FAILURE_REASONS]);
  });
});
