/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRevisedPayload } from './build_revised_payload';
import { MANAGED_CALLER_FIELDS, PROPOSAL_ID_FIELDS, telemetryRecord } from './test_fixtures';

const original = telemetryRecord();

describe('buildRevisedPayload', () => {
  it('reports which parts of the proposal the revision changed', () => {
    expect(
      buildRevisedPayload({
        original,
        revision: telemetryRecord({ comment: 'Isolate both hosts', impact: 'high', revision: 2 }),
      })
    ).toEqual({
      ...MANAGED_CALLER_FIELDS,
      ...PROPOSAL_ID_FIELDS,
      action_input_changed: false,
      comment_changed: true,
      confidence_changed: false,
      impact_changed: true,
      revision: 2,
    });
  });

  it("carries the new revision's id and the chain root, never the predecessor's id", () => {
    const payload = buildRevisedPayload({
      original,
      revision: telemetryRecord({ id: 'proposal-3', revision: 2 }),
    });

    expect(payload).toEqual(
      expect.objectContaining({ proposal_id: 'proposal-3', root_proposal_id: 'proposal-1' })
    );
    expect(JSON.stringify(payload)).not.toContain('proposal-2');
  });

  it('compares the action input by value', () => {
    const payload = buildRevisedPayload({
      original,
      revision: telemetryRecord({ actionInput: { ruleId: 'rule-2' }, revision: 2 }),
    });

    expect(payload.action_input_changed).toBe(true);
    expect(
      buildRevisedPayload({
        original,
        revision: telemetryRecord({ actionInput: { ruleId: 'rule-1' }, revision: 2 }),
      }).action_input_changed
    ).toBe(false);
  });

  it('reports a changed confidence', () => {
    expect(
      buildRevisedPayload({
        original,
        revision: telemetryRecord({ confidence: 'low', revision: 2 }),
      }).confidence_changed
    ).toBe(true);
  });

  it('never ships the text or input it compared', () => {
    const serialized = JSON.stringify(
      buildRevisedPayload({
        original,
        revision: telemetryRecord({ actionInput: { host: 'secret-host' }, comment: 'secret' }),
      })
    );

    expect(serialized).not.toContain('secret');
  });
});
