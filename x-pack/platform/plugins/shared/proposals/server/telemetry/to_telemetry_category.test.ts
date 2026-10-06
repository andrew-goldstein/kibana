/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toTelemetryCategory } from './to_telemetry_category';

describe('toTelemetryCategory', () => {
  it.each(['configure', 'investigate', 'respond'])('ships the known category %s as-is', (value) => {
    expect(toTelemetryCategory(value)).toBe(value);
  });

  it('ships any other category as `other`, so a custom keyword never leaves the cluster', () => {
    expect(toTelemetryCategory('isolate the CFO laptop')).toBe('other');
  });

  it('omits an absent category', () => {
    expect(toTelemetryCategory(undefined)).toBeUndefined();
  });

  it('omits an empty category, as Liquid renders an absent input', () => {
    expect(toTelemetryCategory('')).toBeUndefined();
  });
});
