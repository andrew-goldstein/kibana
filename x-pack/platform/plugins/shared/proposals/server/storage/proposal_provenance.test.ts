/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { proposalDecisionSourceSchema, proposalSettledBySchema } from '@kbn/proposals-common';
import { DECISION_SOURCES, EXPIRY_REASONS } from '../telemetry';

describe('storage-only provenance vocabularies', () => {
  // The stored values ship as telemetry as-is, so the two cannot drift.
  it('stores exactly the decision sources telemetry reports', () => {
    expect([...proposalDecisionSourceSchema.options]).toEqual([...DECISION_SOURCES]);
  });

  it('stores exactly the settle paths telemetry reports as expiry reasons', () => {
    expect([...proposalSettledBySchema.options]).toEqual([...EXPIRY_REASONS]);
  });
});
