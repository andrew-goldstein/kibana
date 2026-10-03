/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { INVESTIGATION_SEVERITIES } from '../telemetry';
import { pickVocabularyValue } from './pick_vocabulary_value';

describe('pickVocabularyValue', () => {
  it('returns a value from the vocabulary', () => {
    expect(pickVocabularyValue('high', INVESTIGATION_SEVERITIES)).toBe('high');
  });

  it('omits a value outside the vocabulary', () => {
    expect(pickVocabularyValue('urgent', INVESTIGATION_SEVERITIES)).toBeUndefined();
  });

  it('omits an array value, even one holding a vocabulary entry', () => {
    expect(pickVocabularyValue(['high'], INVESTIGATION_SEVERITIES)).toBeUndefined();
  });

  it('omits a missing value', () => {
    expect(pickVocabularyValue(undefined, INVESTIGATION_SEVERITIES)).toBeUndefined();
  });
});
