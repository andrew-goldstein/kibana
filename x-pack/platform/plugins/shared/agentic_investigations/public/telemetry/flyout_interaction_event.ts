/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceStart, EventTypeOpts } from '@kbn/core/public';

export const FLYOUT_INTERACTION_EVENT_TYPE = 'agentic_investigations_ui_flyout_interaction';

/**
 * Every flyout interaction the telemetry epic names. `status_edit`, `assignee_edit` and `open_chat`
 * have a control in the flyout today; the rest wait on UI that doesn't exist yet.
 */
export const FLYOUT_INTERACTIONS = [
  'status_edit',
  'severity_edit',
  'assignee_edit',
  'open_chat',
  'open_activity',
  'section_expand',
] as const;

export type FlyoutInteraction = (typeof FLYOUT_INTERACTIONS)[number];

export interface FlyoutInteractionEvent {
  interaction: FlyoutInteraction;
  template_id: string;
}

export const flyoutInteractionEvent: EventTypeOpts<FlyoutInteractionEvent> = {
  eventType: FLYOUT_INTERACTION_EVENT_TYPE,
  schema: {
    interaction: {
      type: 'keyword',
      _meta: {
        description: `What the user did in an Investigation or Escalation flyout, once it succeeded: ${FLYOUT_INTERACTIONS.join(
          ', '
        )}`,
      },
    },
    template_id: {
      type: 'keyword',
      _meta: {
        description:
          'The conversation template of the flyout: investigation or escalation (templates are registered in code)',
      },
    },
  },
};

/** The `reportEvent` half of core analytics; absent where no analytics service is provided. */
export type FlyoutInteractionAnalytics = Pick<AnalyticsServiceStart, 'reportEvent'>;

/** Reports a flyout interaction, never throwing: telemetry must never break the flyout. */
export const reportFlyoutInteraction = (
  analytics: FlyoutInteractionAnalytics | undefined,
  event: FlyoutInteractionEvent
): void => {
  if (!analytics) {
    return;
  }
  try {
    analytics.reportEvent(FLYOUT_INTERACTION_EVENT_TYPE, event);
  } catch {
    // Telemetry is best-effort; a reporting failure must not surface in the UI.
  }
};
