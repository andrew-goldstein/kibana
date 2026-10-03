/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getInvestigationStatusTransition } from './get_investigation_status_transition';

describe('getInvestigationStatusTransition', () => {
  it('reports a close from open', () => {
    expect(getInvestigationStatusTransition({ status: { next: 'closed', previous: 'open' } })).toBe(
      'closed'
    );
  });

  it('reports a close from no status', () => {
    expect(getInvestigationStatusTransition({ status: { next: 'closed' } })).toBe('closed');
  });

  it('reports a reopen from closed', () => {
    expect(getInvestigationStatusTransition({ status: { next: 'open', previous: 'closed' } })).toBe(
      'reopened'
    );
  });

  it('reports nothing when the status first becomes open', () => {
    expect(getInvestigationStatusTransition({ status: { next: 'open' } })).toBeUndefined();
  });

  it('reports nothing when the status is removed', () => {
    expect(getInvestigationStatusTransition({ status: { previous: 'closed' } })).toBeUndefined();
  });

  it('reports nothing when the status did not change', () => {
    expect(
      getInvestigationStatusTransition({ severity: { next: 'high', previous: 'low' } })
    ).toBeUndefined();
  });

  it('reports nothing for a status outside the template options', () => {
    expect(
      getInvestigationStatusTransition({ status: { next: 'archived', previous: 'closed' } })
    ).toBeUndefined();
  });
});
