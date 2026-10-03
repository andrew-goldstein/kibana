/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildCreatedPayload } from './build_created_payload';
import {
  MANAGED_ACTION_ID,
  MANAGED_CALLER_FIELDS,
  PROPOSAL_ID_FIELDS,
  telemetryRecord,
} from './test_fixtures';

describe('buildCreatedPayload', () => {
  it('describes the created proposal by its ids, enums and flags, never its text', () => {
    expect(buildCreatedPayload(telemetryRecord({ autoApproveRequested: true }))).toEqual({
      ...MANAGED_CALLER_FIELDS,
      ...PROPOSAL_ID_FIELDS,
      action_id: MANAGED_ACTION_ID,
      auto_approve_requested: true,
      category: 'respond',
      confidence_bucket: 'high',
      expires_in_bucket: 'le_72h',
      has_action: true,
      impact_class: 'medium',
    });
  });

  it('reads an absent auto-approve request as false', () => {
    expect(
      buildCreatedPayload(telemetryRecord({ autoApproveRequested: undefined }))
        .auto_approve_requested
    ).toBe(false);
  });

  it('reports a proposal with no action, deadline or category', () => {
    const payload = buildCreatedPayload(
      telemetryRecord({
        actionId: undefined,
        actionWorkflowId: undefined,
        category: undefined,
        expiresAt: undefined,
      })
    );

    expect(payload).toEqual(
      expect.objectContaining({ expires_in_bucket: 'none', has_action: false })
    );
    expect(payload).not.toHaveProperty('action_id');
    expect(payload).not.toHaveProperty('category');
  });

  it('ships custom for an action workflow no plugin manages, never its raw id', () => {
    const payload = buildCreatedPayload(
      telemetryRecord({ actionId: 'custom', actionWorkflowId: 'secret-customer-workflow' })
    );

    expect(payload.action_id).toBe('custom');
    expect(JSON.stringify(payload)).not.toContain('secret-customer-workflow');
  });

  it('omits the action id when none was resolved at creation', () => {
    expect(buildCreatedPayload(telemetryRecord({ actionId: undefined }))).not.toHaveProperty(
      'action_id'
    );
  });

  it('reads a chain root as its own root', () => {
    expect(
      buildCreatedPayload(telemetryRecord({ id: 'proposal-1', rootProposalId: 'proposal-1' }))
    ).toEqual(
      expect.objectContaining({ proposal_id: 'proposal-1', root_proposal_id: 'proposal-1' })
    );
  });

  it('reads a record stored before chain roots existed as its own root', () => {
    expect(
      buildCreatedPayload(telemetryRecord({ rootProposalId: undefined })).root_proposal_id
    ).toBe('proposal-2');
  });

  it('ships an unknown category as other', () => {
    expect(buildCreatedPayload(telemetryRecord({ category: 'tune' })).category).toBe('other');
  });
});
