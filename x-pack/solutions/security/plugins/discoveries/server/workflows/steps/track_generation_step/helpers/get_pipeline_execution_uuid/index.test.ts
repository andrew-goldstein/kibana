/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validate, version } from 'uuid';

import { getPipelineExecutionUuid } from '.';

describe('getPipelineExecutionUuid', () => {
  it('returns the same generation id for the same run', () => {
    expect(getPipelineExecutionUuid('pipeline-run-1')).toBe(
      getPipelineExecutionUuid('pipeline-run-1')
    );
  });

  it('returns a different generation id for another run', () => {
    expect(getPipelineExecutionUuid('pipeline-run-1')).not.toBe(
      getPipelineExecutionUuid('pipeline-run-2')
    );
  });

  it('returns a valid version 5 uuid', () => {
    const executionUuid = getPipelineExecutionUuid('pipeline-run-1');

    expect({ valid: validate(executionUuid), version: version(executionUuid) }).toEqual({
      valid: true,
      version: 5,
    });
  });
});
