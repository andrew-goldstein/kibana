/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { KibanaPluginServiceFactory } from '../types';

import type { CustomIntegrationsPlatformService } from '../platform';
import type { CustomIntegrationsStartDependencies } from '../../types';

/**
 * A type definition for a factory to produce the `CustomIntegrationsPlatformService` for use in Kibana.
 */
export type CustomIntegrationsPlatformServiceFactory = KibanaPluginServiceFactory<
  CustomIntegrationsPlatformService,
  CustomIntegrationsStartDependencies
>;

/**
 * A factory to produce the `CustomIntegrationsPlatformService` for use in Kibana.
 */
export const platformServiceFactory: CustomIntegrationsPlatformServiceFactory = ({
  coreStart,
}) => ({
  getBasePath: coreStart.http.basePath.get,
  getAbsolutePath: (path: string): string => coreStart.http.basePath.prepend(`${path}`),
});
