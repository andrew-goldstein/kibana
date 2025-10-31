/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getKibanaFeatureFlags } from '../../attack_discovery/helpers/get_kibana_feature_flags';
import type { ElasticAssistantRequestHandlerContext } from '../../../types';

/**
 * Throws an error with `statusCode: 403` if the Evaluate Anonymization Fields feature is
 * disabled in Kibana feature flags.
 *
 * @throws {Error} - Throws an error with status code 403 if the feature is disabled
 */
export const throwIfEvaluateAnonymizationFieldsDisabled = async (
  context: ElasticAssistantRequestHandlerContext
): Promise<void> => {
  const { evaluateAnonymizationFields } = await getKibanaFeatureFlags(context);

  if (!evaluateAnonymizationFields) {
    throw Object.assign(new Error('Evaluate anonymization fields feature is disabled'), {
      statusCode: 403,
    });
  }
};
