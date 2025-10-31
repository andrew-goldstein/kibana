/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import * as langchainTracers from '@kbn/langchain/server/tracers/langsmith';
import { Client } from 'langsmith';

import { fetchLangSmithDataset } from './utils';

jest.mock('langsmith');
jest.mock('@kbn/langchain/server/tracers/langsmith');

const MockClient = Client as jest.MockedClass<typeof Client>;
const mockIsLangSmithEnabled = langchainTracers.isLangSmithEnabled as jest.Mock;

describe('fetchLangSmithDataset', () => {
  const logger = loggingSystemMock.createLogger();
  const mockDatasetName = 'test-dataset';

  let mockListExamples: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockListExamples = jest.fn().mockImplementation(async function* () {
      // Empty generator
    });

    MockClient.mockImplementation(
      () =>
        ({
          listExamples: mockListExamples,
        } as unknown as Client)
    );

    mockIsLangSmithEnabled.mockReturnValue(true);
  });

  describe('Client initialization with API key', () => {
    it('initializes Client with API key when non-empty string is provided', async () => {
      const apiKey = 'valid-key-123';

      await fetchLangSmithDataset(mockDatasetName, logger, apiKey);

      expect(MockClient).toHaveBeenCalledWith({ apiKey: 'valid-key-123' });
    });

    it('initializes Client without API key config when undefined is provided', async () => {
      await fetchLangSmithDataset(mockDatasetName, logger, undefined);

      expect(MockClient).toHaveBeenCalledWith(undefined);
    });

    it('initializes Client without API key config when empty string is provided', async () => {
      await fetchLangSmithDataset(mockDatasetName, logger, '');

      expect(MockClient).toHaveBeenCalledWith(undefined);
    });
  });
});
