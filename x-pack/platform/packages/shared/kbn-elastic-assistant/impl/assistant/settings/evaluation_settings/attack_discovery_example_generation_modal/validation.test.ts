/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Document } from './validation';
import {
  csvToDocuments,
  documentsToCsv,
  parseJsonFromMarkdown,
  validateDocuments,
  validateExampleOutputs,
} from './validation';

describe('validation', () => {
  describe('validateDocuments', () => {
    it('should validate a valid Document array', () => {
      const validDocuments = [
        {
          pageContent: '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123\nhost.name,hostname',
          metadata: {},
        },
        {
          pageContent: 'user.name,testuser\nprocess.name,test.exe',
          metadata: { source: 'test' },
        },
      ];

      const result = validateDocuments(validDocuments);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(validDocuments);
      expect(result.errors).toBeUndefined();
    });

    it('should reject documents with missing pageContent', () => {
      const invalidDocuments = [
        {
          metadata: {},
        },
      ];

      const result = validateDocuments(invalidDocuments);

      expect(result.valid).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('pageContent');
    });

    it('should reject documents with wrong pageContent type', () => {
      const invalidDocuments = [
        {
          pageContent: 123, // Should be string
          metadata: {},
        },
      ];

      const result = validateDocuments(invalidDocuments);

      expect(result.valid).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
    });

    it('should reject documents with missing metadata', () => {
      const invalidDocuments = [
        {
          pageContent: 'test content',
        },
      ];

      const result = validateDocuments(invalidDocuments);

      expect(result.valid).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('metadata');
    });

    it('should reject non-array input', () => {
      const invalidInput = {
        pageContent: 'test',
        metadata: {},
      };

      const result = validateDocuments(invalidInput);

      expect(result.valid).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
    });

    it('should reject empty arrays as valid (edge case)', () => {
      const emptyArray: Document[] = [];

      const result = validateDocuments(emptyArray);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('validateExampleOutputs', () => {
    it('should validate outputs with anonymizedDocuments', () => {
      const validOutputs = {
        anonymizedDocuments: [
          {
            pageContent: 'test',
            metadata: {},
          },
        ],
        replacements: {
          original1: 'anonymized1',
        },
      };

      const result = validateExampleOutputs(validOutputs);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate outputs with anonymizedAlerts', () => {
      const validOutputs = {
        anonymizedAlerts: [
          {
            pageContent: 'test',
            metadata: {},
          },
        ],
        replacements: {},
      };

      const result = validateExampleOutputs(validOutputs);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate outputs with both anonymizedDocuments and anonymizedAlerts', () => {
      const validOutputs = {
        anonymizedDocuments: [
          {
            pageContent: 'test',
            metadata: {},
          },
        ],
        anonymizedAlerts: [
          {
            pageContent: 'test',
            metadata: {},
          },
        ],
      };

      const result = validateExampleOutputs(validOutputs);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject outputs with neither anonymizedDocuments nor anonymizedAlerts', () => {
      const invalidOutputs = {
        replacements: {},
      };

      const result = validateExampleOutputs(invalidOutputs);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('anonymizedDocuments');
    });

    it('should allow additional fields in outputs', () => {
      const validOutputs = {
        anonymizedDocuments: [
          {
            pageContent: 'test',
            metadata: {},
          },
        ],
        attackDiscoveries: [],
        someOtherField: 'value',
      };

      const result = validateExampleOutputs(validOutputs);

      expect(result.valid).toBe(true);
    });

    it('should reject outputs with invalid document structure', () => {
      const invalidOutputs = {
        anonymizedDocuments: [
          {
            invalidField: 'test', // Missing pageContent and metadata
          },
        ],
      };

      const result = validateExampleOutputs(invalidOutputs);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('parseJsonFromMarkdown', () => {
    it('should parse plain JSON', () => {
      const jsonText = '{"key": "value"}';

      const result = parseJsonFromMarkdown(jsonText);

      expect(result).toEqual({ key: 'value' });
    });

    it('should parse JSON wrapped in markdown code blocks', () => {
      const markdownText = '```json\n{"key": "value"}\n```';

      const result = parseJsonFromMarkdown(markdownText);

      expect(result).toEqual({ key: 'value' });
    });

    it('should parse JSON wrapped in plain code blocks', () => {
      const markdownText = '```\n{"key": "value"}\n```';

      const result = parseJsonFromMarkdown(markdownText);

      expect(result).toEqual({ key: 'value' });
    });

    it('should handle JSON with whitespace', () => {
      const markdownText = '```json\n\n  {"key": "value"}  \n\n```';

      const result = parseJsonFromMarkdown(markdownText);

      expect(result).toEqual({ key: 'value' });
    });

    it('should parse JSON arrays', () => {
      const jsonText = '[{"key": "value1"}, {"key": "value2"}]';

      const result = parseJsonFromMarkdown(jsonText);

      expect(result).toEqual([{ key: 'value1' }, { key: 'value2' }]);
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = 'not valid json';

      expect(() => parseJsonFromMarkdown(invalidJson)).toThrow('Failed to parse JSON');
    });

    it('should throw error for incomplete JSON', () => {
      const incompleteJson = '{"key": "value"';

      expect(() => parseJsonFromMarkdown(incompleteJson)).toThrow('Failed to parse JSON');
    });

    it('should parse complex nested JSON structures', () => {
      const complexJson = JSON.stringify({
        documents: [
          {
            pageContent: 'field1,value1\nfield2,value2',
            metadata: { nested: { key: 'value' } },
          },
        ],
        count: 1,
      });

      const result = parseJsonFromMarkdown(complexJson);

      expect(result).toEqual({
        documents: [
          {
            pageContent: 'field1,value1\nfield2,value2',
            metadata: { nested: { key: 'value' } },
          },
        ],
        count: 1,
      });
    });
  });

  describe('documentsToCsv', () => {
    it('returns concatenated CSV from document pageContent fields', () => {
      const documents: Document[] = [
        {
          metadata: {},
          pageContent: '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123',
        },
        {
          metadata: {},
          pageContent: 'user.name,testuser\nprocess.name,test.exe',
        },
      ];

      const result = documentsToCsv(documents);

      expect(result).toBe(
        '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123\n\nuser.name,testuser\nprocess.name,test.exe'
      );
    });

    it('returns empty string for empty array', () => {
      const documents: Document[] = [];

      const result = documentsToCsv(documents);

      expect(result).toBe('');
    });

    it('returns single pageContent for single document', () => {
      const documents: Document[] = [
        {
          metadata: {},
          pageContent: 'field1,value1\nfield2,value2',
        },
      ];

      const result = documentsToCsv(documents);

      expect(result).toBe('field1,value1\nfield2,value2');
    });
  });

  describe('csvToDocuments', () => {
    it('returns array of Documents from CSV text', () => {
      const csv =
        '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123\n\nuser.name,testuser\nprocess.name,test.exe';

      const result = csvToDocuments(csv);

      expect(result).toEqual([
        {
          metadata: {},
          pageContent: '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123',
        },
        {
          metadata: {},
          pageContent: 'user.name,testuser\nprocess.name,test.exe',
        },
      ]);
    });

    it('returns single document from CSV without blank lines', () => {
      const csv = 'field1,value1\nfield2,value2';

      const result = csvToDocuments(csv);

      expect(result).toEqual([
        {
          metadata: {},
          pageContent: 'field1,value1\nfield2,value2',
        },
      ]);
    });

    it('returns empty array for empty string', () => {
      const csv = '';

      const result = csvToDocuments(csv);

      expect(result).toEqual([]);
    });

    it('returns empty array for whitespace only', () => {
      const csv = '   \n\n   ';

      const result = csvToDocuments(csv);

      expect(result).toEqual([]);
    });

    it('returns trimmed pageContent for documents', () => {
      const csv = '  field1,value1\nfield2,value2  \n\n  field3,value3  ';

      const result = csvToDocuments(csv);

      expect(result).toEqual([
        {
          metadata: {},
          pageContent: 'field1,value1\nfield2,value2',
        },
        {
          metadata: {},
          pageContent: 'field3,value3',
        },
      ]);
    });
  });

  describe('CSV round-trip conversion', () => {
    it('preserves data through documentsToCsv and csvToDocuments', () => {
      const originalDocuments: Document[] = [
        {
          metadata: {},
          pageContent: '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123\nhost.name,hostname',
        },
        {
          metadata: {},
          pageContent: 'user.name,testuser\nprocess.name,test.exe',
        },
        {
          metadata: {},
          pageContent: 'source.ip,192.168.1.1\ndestination.ip,10.0.0.1',
        },
      ];

      const csv = documentsToCsv(originalDocuments);
      const roundTripDocuments = csvToDocuments(csv);

      expect(roundTripDocuments).toEqual(originalDocuments);
    });

    it('preserves single document through round-trip', () => {
      const originalDocuments: Document[] = [
        {
          metadata: {},
          pageContent: 'field1,value1\nfield2,value2\nfield3,value3',
        },
      ];

      const csv = documentsToCsv(originalDocuments);
      const roundTripDocuments = csvToDocuments(csv);

      expect(roundTripDocuments).toEqual(originalDocuments);
    });
  });
});
