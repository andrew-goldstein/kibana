/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import * as t from 'io-ts';
import { pick } from 'lodash';
import { isActiveGoldLicense } from '../../../../common/license_check';
import { INVALID_LICENSE } from '../../../../common/custom_link';
import { FILTER_OPTIONS } from '../../../../common/custom_link/custom_link_filter_options';
import { notifyFeatureUsage } from '../../../feature';
import { createOrUpdateCustomLink } from './create_or_update_custom_link';
import { filterOptionsRt, payloadRt } from './custom_link_types';
import { deleteCustomLink } from './delete_custom_link';
import { getTransaction } from './get_transaction';
import { listCustomLinks } from './list_custom_links';
import { createApmServerRoute } from '../../apm_routes/create_apm_server_route';
import { getApmEventClient } from '../../../lib/helpers/get_apm_event_client';
import { createInternalESClientWithResources } from '../../../lib/helpers/create_es_client/create_internal_es_client';
import type { Transaction } from '../../../../typings/es_schemas/ui/transaction';
import type { CustomLink } from '../../../../common/custom_link/custom_link_types';

const customLinkTransactionRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/settings/custom_links/transaction',
  security: { authz: { requiredPrivileges: ['apm'] } },
  params: t.partial({
    query: filterOptionsRt,
  }),
  handler: async (resources): Promise<Transaction> => {
    const apmEventClient = await getApmEventClient(resources);
    const { params } = resources;
    const { query } = params;
    // picks only the items listed in FILTER_OPTIONS
    const filters = pick(query, FILTER_OPTIONS);
    return await getTransaction({ apmEventClient, filters });
  },
});

const listCustomLinksRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/settings/custom_links',
  security: { authz: { requiredPrivileges: ['apm'] } },
  params: t.partial({
    query: filterOptionsRt,
  }),
  handler: async (
    resources
  ): Promise<{
    customLinks: CustomLink[];
  }> => {
    const { context, params } = resources;
    const licensingContext = await context.licensing;

    if (!isActiveGoldLicense(licensingContext.license)) {
      throw Boom.forbidden(INVALID_LICENSE);
    }

    const { query } = params;
    const internalESClient = await createInternalESClientWithResources(resources);

    // picks only the items listed in FILTER_OPTIONS
    const filters = pick(query, FILTER_OPTIONS);
    const customLinks = await listCustomLinks({
      internalESClient,
      filters,
    });
    return { customLinks };
  },
});

const createCustomLinkRoute = createApmServerRoute({
  endpoint: 'POST /internal/apm/settings/custom_links',
  params: t.type({
    body: payloadRt,
  }),
  security: {
    authz: {
      requiredPrivileges: ['apm', 'apm_settings_write'],
    },
  },
  handler: async (resources): Promise<void> => {
    const { context, params } = resources;
    const licensingContext = await context.licensing;

    if (!isActiveGoldLicense(licensingContext.license)) {
      throw Boom.forbidden(INVALID_LICENSE);
    }

    const internalESClient = await createInternalESClientWithResources(resources);
    const customLink = params.body;

    notifyFeatureUsage({
      licensingPlugin: licensingContext,
      featureName: 'customLinks',
    });

    await createOrUpdateCustomLink({ customLink, internalESClient });
  },
});

const updateCustomLinkRoute = createApmServerRoute({
  endpoint: 'PUT /internal/apm/settings/custom_links/{id}',
  params: t.type({
    path: t.type({
      id: t.string,
    }),
    body: payloadRt,
  }),
  security: {
    authz: {
      requiredPrivileges: ['apm', 'apm_settings_write'],
    },
  },
  handler: async (resources): Promise<void> => {
    const { params, context } = resources;
    const licensingContext = await context.licensing;

    if (!isActiveGoldLicense(licensingContext.license)) {
      throw Boom.forbidden(INVALID_LICENSE);
    }

    const internalESClient = await createInternalESClientWithResources(resources);

    const { id } = params.path;
    const customLink = params.body;

    await createOrUpdateCustomLink({
      customLinkId: id,
      customLink,
      internalESClient,
    });
  },
});

const deleteCustomLinkRoute = createApmServerRoute({
  endpoint: 'DELETE /internal/apm/settings/custom_links/{id}',
  params: t.type({
    path: t.type({
      id: t.string,
    }),
  }),
  security: {
    authz: {
      requiredPrivileges: ['apm', 'apm_settings_write'],
    },
  },
  handler: async (resources): Promise<{ result: string }> => {
    const { context, params } = resources;
    const licensingContext = await context.licensing;

    if (!isActiveGoldLicense(licensingContext.license)) {
      throw Boom.forbidden(INVALID_LICENSE);
    }

    const internalESClient = await createInternalESClientWithResources(resources);
    const { id } = params.path;
    return deleteCustomLink({ customLinkId: id, internalESClient });
  },
});

export const customLinkRouteRepository = {
  ...customLinkTransactionRoute,
  ...listCustomLinksRoute,
  ...createCustomLinkRoute,
  ...updateCustomLinkRoute,
  ...deleteCustomLinkRoute,
};
