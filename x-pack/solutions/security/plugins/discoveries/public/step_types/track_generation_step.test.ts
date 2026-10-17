/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { StepCategory } from '@kbn/workflows';
import { trackGenerationStepPublicDefinition } from './track_generation_step';
import { TrackGenerationStepTypeId } from '../../common/step_types/track_generation_step';

describe('trackGenerationStepPublicDefinition', () => {
  describe('id', () => {
    it('returns the correct id', () => {
      expect(trackGenerationStepPublicDefinition.id).toBe(TrackGenerationStepTypeId);
    });

    it('returns security.attack-discovery.trackGeneration', () => {
      expect(trackGenerationStepPublicDefinition.id).toBe(
        'security.attack-discovery.trackGeneration'
      );
    });
  });

  describe('label', () => {
    it('is not empty', () => {
      expect(trackGenerationStepPublicDefinition.label.length).toBeGreaterThan(0);
    });
  });

  describe('description', () => {
    it('is not empty', () => {
      expect(trackGenerationStepPublicDefinition.description?.length).toBeGreaterThan(0);
    });
  });

  describe('icon', () => {
    it('is defined', () => {
      expect(trackGenerationStepPublicDefinition.icon).toBeDefined();
    });
  });

  describe('category', () => {
    it('is set to AI', () => {
      expect(trackGenerationStepPublicDefinition.category).toBe(StepCategory.Ai);
    });
  });

  describe('schemas', () => {
    it('has inputSchema defined', () => {
      expect(trackGenerationStepPublicDefinition.inputSchema).toBeDefined();
    });

    it('has outputSchema defined', () => {
      expect(trackGenerationStepPublicDefinition.outputSchema).toBeDefined();
    });

    it.each(['previous_run', 'this_run'])('accepts the reconcile phase with scope %s', (scope) => {
      expect(
        trackGenerationStepPublicDefinition.inputSchema.safeParse({ phase: 'reconcile', scope })
          .success
      ).toBe(true);
    });

    it('rejects an unknown reconcile scope', () => {
      expect(
        trackGenerationStepPublicDefinition.inputSchema.safeParse({
          phase: 'reconcile',
          scope: 'every_run',
        }).success
      ).toBe(false);
    });
  });

  describe('documentation', () => {
    it('has non-empty details', () => {
      expect(trackGenerationStepPublicDefinition.documentation?.details?.length).toBeGreaterThan(0);
    });

    it.each([
      'started',
      'retrieval_completed',
      'generation_completed',
      'succeeded',
      'failed',
      'reconcile',
    ])('documents the %s phase', (phase) => {
      expect(trackGenerationStepPublicDefinition.documentation?.details).toContain(`\`${phase}\``);
    });

    it('has at least one example', () => {
      expect(trackGenerationStepPublicDefinition.documentation?.examples?.length).toBeGreaterThan(
        0
      );
    });
  });

  describe('documentation examples', () => {
    const examples = trackGenerationStepPublicDefinition.documentation?.examples ?? [];

    it.each(examples.map((example, index) => [index, example]))(
      'example %i contains a YAML code block',
      (_index, example) => {
        expect(example).toContain('```yaml');
      }
    );

    it.each(examples.map((example, index) => [index, example]))(
      'example %i references the track generation step type',
      (_index, example) => {
        expect(example).toContain(`type: ${TrackGenerationStepTypeId}`);
      }
    );
  });
});
