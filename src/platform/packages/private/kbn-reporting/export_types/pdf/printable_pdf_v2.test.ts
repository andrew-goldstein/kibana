/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Rx from 'rxjs';
import { Writable } from 'stream';

import { coreMock, elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { CancellationToken } from '@kbn/reporting-common';
import type { LocatorParams } from '@kbn/reporting-common/types';
import type { TaskPayloadPDFV2 } from '@kbn/reporting-export-types-pdf-common';
import { createMockConfigSchema } from '@kbn/reporting-mocks-server';
import { cryptoFactory } from '@kbn/reporting-server';
import { createMockScreenshottingStart } from '@kbn/screenshotting-plugin/server/mock';
import { PdfExportType } from '.';
import { FakeRawRequest, KibanaRequest } from '@kbn/core/server';

let content: string;
let mockPdfExportType: PdfExportType;
let stream: jest.Mocked<Writable>;

const cancellationToken = new CancellationToken();
const taskInstanceFields = { startedAt: null, retryAt: null };
const mockLogger = loggingSystemMock.createLogger();

const fakeRawRequest: FakeRawRequest = {
  headers: {
    authorization: `ApiKey skdjtq4u543yt3rhewrh`,
  },
  path: '/',
};

const mockEncryptionKey = 'testencryptionkey';
const encryptHeaders = async (headers: Record<string, string>) => {
  const crypto = cryptoFactory(mockEncryptionKey);
  return await crypto.encrypt(headers);
};
let encryptedHeaders: string;

const screenshottingMock = createMockScreenshottingStart();
const getScreenshotsSpy = jest.spyOn(screenshottingMock, 'getScreenshots');
const testContent = 'raw string from get_screenhots';
const getBasePayload = (baseObj: any) =>
  ({
    params: { forceNow: 'test' },
    ...baseObj,
  } as TaskPayloadPDFV2);

beforeEach(async () => {
  content = '';
  stream = { write: jest.fn((chunk) => (content += chunk)) } as unknown as typeof stream;

  const configType = createMockConfigSchema({ encryptionKey: mockEncryptionKey });
  const context = coreMock.createPluginInitializerContext(configType);

  const mockCoreSetup = coreMock.createSetup();
  const mockCoreStart = coreMock.createStart();

  encryptedHeaders = await encryptHeaders({});

  mockPdfExportType = new PdfExportType(mockCoreSetup, configType, mockLogger, context);
  mockPdfExportType.setup({
    basePath: { set: jest.fn() },
  });
  mockPdfExportType.start({
    esClient: elasticsearchServiceMock.createClusterClient(),
    savedObjects: mockCoreStart.savedObjects,
    uiSettings: mockCoreStart.uiSettings,
    screenshotting: screenshottingMock,
  });

  getScreenshotsSpy.mockImplementation((opts) => {
    const { logger } = opts;
    logger?.get('screenshotting');
    return Rx.of({
      metrics: { cpu: 0, pages: 1 },
      data: Buffer.from(testContent),
      errors: [],
      renderErrors: [],
    });
  });
});

test(`passes browserTimezone to getScreenshots`, async () => {
  const browserTimezone = 'UTC';
  await mockPdfExportType.runTask({
    jobId: 'pdfJobId',
    request: fakeRawRequest as unknown as KibanaRequest,
    payload: getBasePayload({
      forceNow: 'test',
      layout: { dimensions: {} },
      title: 'PDF Params Timezone Test',
      locatorParams: [{ version: 'test', id: 'test' }] as LocatorParams[],
      browserTimezone,
      headers: encryptedHeaders,
    }),
    taskInstanceFields,
    cancellationToken,
    stream,
  });

  expect(getScreenshotsSpy).toHaveBeenCalledWith(
    expect.objectContaining({ browserTimezone: 'UTC' })
  );
});

test(`returns content_type of application/pdf`, async () => {
  const { content_type: contentType } = await mockPdfExportType.runTask({
    jobId: 'pdfJobId',
    request: fakeRawRequest as unknown as KibanaRequest,
    payload: getBasePayload({
      layout: { dimensions: {} },
      locatorParams: [{ version: 'test', id: 'test' }] as LocatorParams[],
      headers: encryptedHeaders,
    }),
    taskInstanceFields,
    cancellationToken,
    stream,
  });
  expect(contentType).toBe('application/pdf');
});

test(`returns buffer content base64 encoded`, async () => {
  await mockPdfExportType.runTask({
    jobId: 'pdfJobId',
    request: fakeRawRequest as unknown as KibanaRequest,
    payload: getBasePayload({
      layout: { dimensions: {} },
      locatorParams: [{ version: 'test', id: 'test' }] as LocatorParams[],
      headers: encryptedHeaders,
    }),
    taskInstanceFields,
    cancellationToken,
    stream,
  });

  expect(content).toEqual(testContent);
});

test(`screenshotting plugin uses the logger provided by the PDF export-type`, async () => {
  const logSpy = jest.spyOn(mockLogger, 'get');

  await mockPdfExportType.runTask({
    jobId: 'pdfJobId',
    request: fakeRawRequest as unknown as KibanaRequest,
    payload: getBasePayload({
      layout: { dimensions: {} },
      locatorParams: [{ version: 'test', id: 'test' }] as LocatorParams[],
      headers: encryptedHeaders,
    }),
    taskInstanceFields,
    cancellationToken,
    stream,
  });

  expect(logSpy).toHaveBeenCalledWith('screenshotting');
});
