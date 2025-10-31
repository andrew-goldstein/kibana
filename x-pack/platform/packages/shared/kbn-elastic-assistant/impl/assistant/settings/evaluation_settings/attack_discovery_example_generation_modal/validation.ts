/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';

/**
 * Document schema matching server-side format used in alert replay from PR #195669
 * Each Document represents an anonymized alert with CSV-formatted content
 */
export const Document = z.object({
  /**
   * CSV-formatted string containing alert field-value pairs
   * Format: field,value\nfield,value\n...
   * Example: '@timestamp,2024-10-10T21:01:24.148Z\n_id,abc123\nhost.name,hostname'
   */
  pageContent: z.string(),
  /**
   * Metadata object (typically empty for anonymized alerts)
   */
  metadata: z.record(z.string(), z.any()),
});

export const DocumentArray = z.array(Document);

export type Document = z.infer<typeof Document>;

/**
 * Validates an array of documents against the Document schema
 * Used in steps 4 and 5 to validate LLM-generated content
 *
 * @param data - The data to validate
 * @returns Validation result with parsed data or error messages
 */
export const validateDocuments = (
  data: unknown
): {
  valid: boolean;
  data?: Document[];
  errors?: string[];
} => {
  const result = DocumentArray.safeParse(data);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
};

/**
 * Basic schema for example outputs structure
 * Validates the structure of the final combined example
 */
export const ExampleOutputsSchema = z
  .object({
    /**
     * Preferred field name for anonymized documents
     */
    anonymizedDocuments: DocumentArray.optional(),
    /**
     * Legacy field name maintained for backward compatibility
     */
    anonymizedAlerts: DocumentArray.optional(),
    /**
     * Anonymization replacements mapping original values to anonymized values
     */
    replacements: z.record(z.string(), z.string()).optional(),
    /**
     * Allow additional fields that may exist in example outputs
     */
  })
  .passthrough();

/**
 * Validates the final combined example outputs structure
 * Ensures the structure matches what's expected for alert replay evaluations
 *
 * @param outputs - The outputs object to validate
 * @returns Validation result with error messages if invalid
 */
export const validateExampleOutputs = (
  outputs: unknown
): {
  valid: boolean;
  errors?: string[];
} => {
  const result = ExampleOutputsSchema.safeParse(outputs);

  if (result.success) {
    // Additional validation: at least one of anonymizedDocuments or anonymizedAlerts should be present
    const data = result.data;
    if (!data.anonymizedDocuments && !data.anonymizedAlerts) {
      return {
        valid: false,
        errors: ['At least one of anonymizedDocuments or anonymizedAlerts must be provided'],
      };
    }
    return { valid: true };
  }

  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
};

/**
 * Attempts to parse JSON from text that may be wrapped in markdown code blocks
 * Handles cases where LLM returns JSON within ```json or ``` blocks
 *
 * @param text - The text potentially containing JSON
 * @returns Parsed JSON object or throws error
 */
export const parseJsonFromMarkdown = (text: string): unknown => {
  // Remove markdown code blocks if present
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = text.match(codeBlockRegex);

  const jsonText = match ? match[1] : text;

  try {
    return JSON.parse(jsonText.trim());
  } catch (error) {
    throw new Error(
      `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Converts an array of Document objects to CSV format
 * Concatenates all pageContent fields, separating documents with blank lines
 *
 * @param documents - Array of Document objects to convert
 * @returns CSV string with documents separated by blank lines
 */
export const documentsToCsv = (documents: Document[]): string => {
  return documents.map((doc) => doc.pageContent).join('\n\n');
};

/**
 * Parses CSV text back into an array of Document objects
 * Splits by blank lines to separate individual documents
 *
 * @param csv - CSV string to parse
 * @returns Array of Document objects
 */
export const csvToDocuments = (csv: string): Document[] => {
  // Split by blank lines (two or more consecutive newlines)
  const documentContents = csv.split(/\n\s*\n/).filter((content) => content.trim().length > 0);

  return documentContents.map((pageContent) => ({
    metadata: {},
    pageContent: pageContent.trim(),
  }));
};
