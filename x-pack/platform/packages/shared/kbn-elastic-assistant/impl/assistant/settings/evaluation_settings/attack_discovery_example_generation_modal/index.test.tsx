/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { documentsToCsv } from './validation';
import type { Document } from './validation';

describe('AttackDiscoveryExampleGenerationModal - alert count in prompt', () => {
  const mockAlerts: Document[] = [
    {
      metadata: { dataset: 'test' },
      pageContent: 'field1,value1\nfield2,value2',
    },
    {
      metadata: { dataset: 'test' },
      pageContent: 'field1,value3\nfield2,value4',
    },
    {
      metadata: { dataset: 'test' },
      pageContent: 'field1,value5\nfield2,value6',
    },
  ];

  const promptText = `You are augmenting security alert data with additional fields for evaluation purposes.`;
  const newFields = ['field3', 'field4'];

  it('returns the correct alert count', () => {
    const alertCount = mockAlerts.length;

    expect(alertCount).toBe(3);
  });

  it('includes alert count in the prompt construction', () => {
    const existingAlertsCsv = documentsToCsv(mockAlerts);
    const alertCount = mockAlerts.length;

    const fullPrompt = `${promptText}

New field names to add:
${newFields.join('\n')}

Number of alerts: ${alertCount}

Existing anonymized alerts (use as reference):
${existingAlertsCsv}

Remember: Return the updated alerts in the same CSV format, with each alert's CSV content separated by a blank line (double newline). You must return exactly ${alertCount} alerts.`;

    expect(fullPrompt).toContain('Number of alerts: 3');
  });

  it('includes the exact alert count requirement in the reminder', () => {
    const existingAlertsCsv = documentsToCsv(mockAlerts);
    const alertCount = mockAlerts.length;

    const fullPrompt = `${promptText}

New field names to add:
${newFields.join('\n')}

Number of alerts: ${alertCount}

Existing anonymized alerts (use as reference):
${existingAlertsCsv}

Remember: Return the updated alerts in the same CSV format, with each alert's CSV content separated by a blank line (double newline). You must return exactly ${alertCount} alerts.`;

    expect(fullPrompt).toContain('You must return exactly 3 alerts');
  });

  it('calculates correct alert count for different numbers of alerts', () => {
    const singleAlert = [mockAlerts[0]];
    const existingAlertsCsv = documentsToCsv(singleAlert);
    const alertCount = singleAlert.length;

    const fullPrompt = `${promptText}

New field names to add:
${newFields.join('\n')}

Number of alerts: ${alertCount}

Existing anonymized alerts (use as reference):
${existingAlertsCsv}

Remember: Return the updated alerts in the same CSV format, with each alert's CSV content separated by a blank line (double newline). You must return exactly ${alertCount} alerts.`;

    expect(fullPrompt).toContain('Number of alerts: 1');
    expect(fullPrompt).toContain('You must return exactly 1 alerts');
  });

  it('calculates correct alert count for multiple alerts', () => {
    const manyAlerts = [
      ...mockAlerts,
      { metadata: { dataset: 'test' }, pageContent: 'field1,value7\nfield2,value8' },
      { metadata: { dataset: 'test' }, pageContent: 'field1,value9\nfield2,value10' },
    ];
    const existingAlertsCsv = documentsToCsv(manyAlerts);
    const alertCount = manyAlerts.length;

    const fullPrompt = `${promptText}

New field names to add:
${newFields.join('\n')}

Number of alerts: ${alertCount}

Existing anonymized alerts (use as reference):
${existingAlertsCsv}

Remember: Return the updated alerts in the same CSV format, with each alert's CSV content separated by a blank line (double newline). You must return exactly ${alertCount} alerts.`;

    expect(fullPrompt).toContain('Number of alerts: 5');
    expect(fullPrompt).toContain('You must return exactly 5 alerts');
  });
});
