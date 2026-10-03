/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildResumeRejectedPayload } from './build_resume_rejected_payload';
import { MANAGED_CALLER_FIELDS, PROPOSAL_ID_FIELDS, telemetryRecord } from './test_fixtures';

describe('buildResumeRejectedPayload', () => {
  it('reports the refusal reason with the caller and proposal id fields', () => {
    expect(buildResumeRejectedPayload(telemetryRecord(), 'unprivileged')).toEqual({
      ...MANAGED_CALLER_FIELDS,
      ...PROPOSAL_ID_FIELDS,
      reason: 'unprivileged',
    });
  });
});
