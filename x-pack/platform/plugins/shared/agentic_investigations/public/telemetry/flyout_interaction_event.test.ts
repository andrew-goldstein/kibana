/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAnalytics } from '@elastic/ebt/client';
import { loggerMock } from '@kbn/logging-mocks';
import {
  FLYOUT_INTERACTION_EVENT_TYPE,
  FLYOUT_INTERACTIONS,
  flyoutInteractionEvent,
  reportFlyoutInteraction,
  toFlyoutTemplateId,
} from './flyout_interaction_event';

describe('toFlyoutTemplateId', () => {
  it.each(['investigation', 'escalation'])('keeps the registered template id %s', (templateId) => {
    expect(toFlyoutTemplateId(templateId)).toBe(templateId);
  });

  it('returns undefined for any other template id', () => {
    expect(toFlyoutTemplateId('user-authored template')).toBeUndefined();
  });
});

describe('flyoutInteractionEvent', () => {
  const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });

  beforeAll(() => {
    analytics.registerEventType(flyoutInteractionEvent);
  });

  afterAll(async () => {
    await analytics.shutdown();
  });

  it.each(FLYOUT_INTERACTIONS)('accepts interaction: %s', (interaction) => {
    expect(() =>
      analytics.reportEvent(FLYOUT_INTERACTION_EVENT_TYPE, {
        interaction,
        template_id: 'investigation',
      })
    ).not.toThrow();
  });

  it('rejects a field the schema does not declare', () => {
    expect(() =>
      analytics.reportEvent(FLYOUT_INTERACTION_EVENT_TYPE, {
        interaction: 'assignee_edit',
        template_id: 'investigation',
        assignees: 2,
      })
    ).toThrow(/assignees/);
  });

  it('describes every field', () => {
    Object.values(flyoutInteractionEvent.schema).forEach((field) => {
      expect(field).toEqual(expect.objectContaining({ _meta: expect.anything() }));
    });
  });

  it('declares every field required', () => {
    const optionalFlags = Object.values(flyoutInteractionEvent.schema).map(
      (field) => (field as { _meta: { optional: boolean } })._meta.optional
    );

    expect(optionalFlags).toEqual([false, false]);
  });
});

describe('reportFlyoutInteraction', () => {
  it('reports the event', () => {
    const reportEvent = jest.fn();

    reportFlyoutInteraction(
      { reportEvent },
      { interaction: 'status_edit', template_id: 'escalation' }
    );

    expect(reportEvent).toHaveBeenCalledWith(FLYOUT_INTERACTION_EVENT_TYPE, {
      interaction: 'status_edit',
      template_id: 'escalation',
    });
  });

  it('does nothing without an analytics service', () => {
    expect(() =>
      reportFlyoutInteraction(undefined, { interaction: 'status_edit', template_id: 'escalation' })
    ).not.toThrow();
  });

  it('never throws when reporting fails', () => {
    const reportEvent = jest.fn(() => {
      throw new Error('not registered');
    });

    expect(() =>
      reportFlyoutInteraction(
        { reportEvent },
        { interaction: 'assignee_edit', template_id: 'investigation' }
      )
    ).not.toThrow();
  });
});
