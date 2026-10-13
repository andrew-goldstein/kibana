/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRetriedPayload } from './build_retried_payload';
import { COMMON_FIELDS, PROPOSAL_ID_FIELDS, telemetryRecord } from './test_fixtures';

describe('buildRetriedPayload', () => {
  it('reports the retry by its common and id fields only', () => {
    // A chain's attempt count is the number of retried events sharing its root.
    expect(buildRetriedPayload(telemetryRecord())).toEqual({
      ...COMMON_FIELDS,
      ...PROPOSAL_ID_FIELDS,
    });
  });

  it("carries the clone's own id and the chain root it inherited", () => {
    expect(
      buildRetriedPayload(telemetryRecord({ id: 'proposal-3', rootProposalId: 'proposal-1' }))
    ).toEqual(
      expect.objectContaining({ proposal_id: 'proposal-3', root_proposal_id: 'proposal-1' })
    );
  });
});
