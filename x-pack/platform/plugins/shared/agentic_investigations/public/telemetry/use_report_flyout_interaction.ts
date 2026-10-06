/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import type { CoreStart } from '@kbn/core/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  reportFlyoutInteraction,
  toFlyoutTemplateId,
  type FlyoutInteraction,
} from './flyout_interaction_event';

/**
 * Returns a callback that reports a successful flyout interaction through core analytics. A
 * template id outside the closed vocabulary is not reported.
 */
export const useReportFlyoutInteraction = (): ((
  interaction: FlyoutInteraction,
  templateId: string
) => void) => {
  const {
    services: { analytics },
  } = useKibana<CoreStart>();

  return useCallback(
    (interaction: FlyoutInteraction, templateId: string) => {
      const flyoutTemplateId = toFlyoutTemplateId(templateId);
      if (flyoutTemplateId === undefined) {
        return;
      }
      reportFlyoutInteraction(analytics, { interaction, template_id: flyoutTemplateId });
    },
    [analytics]
  );
};
