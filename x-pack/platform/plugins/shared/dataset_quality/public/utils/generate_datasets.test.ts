/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DataStreamStatType } from '../../common/data_streams_stats';
import { Integration } from '../../common/data_streams_stats/integration';
import { DEFAULT_DICTIONARY_TYPE } from '../state_machines/dataset_quality_controller';
import { generateDatasets } from './generate_datasets';

describe('generateDatasets', () => {
  const integrations: Integration[] = [
    {
      name: 'system',
      title: 'System',
      version: '1.54.0',
      datasets: {
        'system.application': 'Windows Application Events',
        'system.auth': 'System auth logs',
        'system.security': 'Security logs',
        'system.syslog': 'System syslog logs',
        'system.system': 'Windows System Events',
      },
    },
    {
      name: 'custom',
      title: 'Custom',
      version: '1.0.0',
      datasets: {
        custom: 'Custom',
      },
    },
  ];

  const dataStreamStats: DataStreamStatType[] = [
    {
      hasFailureStore: true,
      name: 'logs-system.application-default',
      lastActivity: 1712911241117,
      size: '82.1kb',
      sizeBytes: 84160,
      totalDocs: 100,
      integration: 'system',
      userPrivileges: {
        canMonitor: true,
        canReadFailureStore: true,
      },
    },
    {
      hasFailureStore: false,
      name: 'logs-synth-default',
      lastActivity: 1712911241117,
      size: '62.5kb',
      sizeBytes: 64066,
      totalDocs: 100,
      userPrivileges: {
        canMonitor: true,
        canReadFailureStore: true,
      },
    },
  ];

  const totalDocs = {
    ...DEFAULT_DICTIONARY_TYPE,
    logs: [
      {
        dataset: 'logs-system.application-default',
        count: 100,
      },
      {
        dataset: 'logs-synth-default',
        count: 100,
      },
    ],
  };

  const degradedDocs = [
    {
      dataset: 'logs-synth-default',
      count: 6,
    },
  ];

  const failedDocs = [
    {
      dataset: 'logs-system.application-default',
      count: 2,
    },
  ];

  it('merges integrations information with dataStreamStats, degradedDocs and failedDocs', () => {
    const datasets = generateDatasets(
      dataStreamStats,
      degradedDocs,
      failedDocs,
      integrations,
      totalDocs
    );

    expect(datasets).toEqual([
      {
        name: 'system.application',
        type: 'logs',
        namespace: 'default',
        title: 'Windows Application Events',
        rawName: 'logs-system.application-default',
        lastActivity: 1712911241117,
        size: '82.1kb',
        sizeBytes: 84160,
        integration: integrations[0],
        totalDocs: 100,
        userPrivileges: {
          canMonitor: true,
          canReadFailureStore: true,
        },
        docsInTimeRange: 102,
        quality: 'degraded',
        degradedDocs: {
          percentage: 0,
          count: 0,
        },
        failedDocs: {
          percentage: 1.9607843137254901,
          count: 2,
        },
        hasFailureStore: true,
      },
      {
        name: 'synth',
        type: 'logs',
        namespace: 'default',
        title: 'synth',
        rawName: 'logs-synth-default',
        lastActivity: 1712911241117,
        size: '62.5kb',
        sizeBytes: 64066,
        integration: undefined,
        totalDocs: 100,
        userPrivileges: {
          canMonitor: true,
          canReadFailureStore: true,
        },
        docsInTimeRange: 100,
        quality: 'poor',
        degradedDocs: {
          count: 6,
          percentage: 6,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
    ]);
  });

  it('merges integrations information with dataStreamStats and degradedDocs when no docs in timerange', () => {
    const datasets = generateDatasets(
      dataStreamStats,
      degradedDocs,
      failedDocs,
      integrations,
      DEFAULT_DICTIONARY_TYPE
    );

    expect(datasets).toEqual([
      {
        name: 'system.application',
        type: 'logs',
        namespace: 'default',
        title: 'Windows Application Events',
        rawName: 'logs-system.application-default',
        lastActivity: 1712911241117,
        size: '82.1kb',
        sizeBytes: 84160,
        integration: integrations[0],
        totalDocs: 100,
        userPrivileges: {
          canMonitor: true,
          canReadFailureStore: true,
        },
        docsInTimeRange: 2,
        quality: 'poor',
        degradedDocs: {
          percentage: 0,
          count: 0,
        },
        failedDocs: {
          percentage: 100,
          count: 2,
        },
        hasFailureStore: true,
      },
      {
        name: 'synth',
        type: 'logs',
        namespace: 'default',
        title: 'synth',
        rawName: 'logs-synth-default',
        lastActivity: 1712911241117,
        size: '62.5kb',
        sizeBytes: 64066,
        integration: undefined,
        totalDocs: 100,
        userPrivileges: {
          canMonitor: true,
          canReadFailureStore: true,
        },
        docsInTimeRange: 0,
        quality: 'good',
        degradedDocs: {
          count: 6,
          percentage: 0,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
    ]);
  });

  it('merges integrations information with degradedDocs', () => {
    const datasets = generateDatasets([], degradedDocs, [], integrations, totalDocs);

    expect(datasets).toEqual([
      {
        name: 'system.application',
        type: 'logs',
        namespace: 'default',
        title: 'Windows Application Events',
        rawName: 'logs-system.application-default',
        lastActivity: undefined,
        size: undefined,
        sizeBytes: undefined,
        integration: integrations[0],
        totalDocs: undefined,
        userPrivileges: undefined,
        docsInTimeRange: 100,
        quality: 'good',
        degradedDocs: {
          percentage: 0,
          count: 0,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
      {
        name: 'synth',
        type: 'logs',
        namespace: 'default',
        title: 'synth',
        rawName: 'logs-synth-default',
        lastActivity: undefined,
        size: undefined,
        sizeBytes: undefined,
        integration: undefined,
        totalDocs: undefined,
        userPrivileges: undefined,
        docsInTimeRange: 100,
        quality: 'poor',
        degradedDocs: {
          count: 6,
          percentage: 6,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
    ]);
  });

  it('merges integrations information with degradedDocs and totalDocs', () => {
    const datasets = generateDatasets([], degradedDocs, [], integrations, {
      ...totalDocs,
      logs: [...totalDocs.logs, { dataset: 'logs-another-default', count: 100 }],
    });

    expect(datasets).toEqual([
      {
        name: 'system.application',
        type: 'logs',
        namespace: 'default',
        title: 'Windows Application Events',
        rawName: 'logs-system.application-default',
        lastActivity: undefined,
        size: undefined,
        sizeBytes: undefined,
        integration: integrations[0],
        totalDocs: undefined,
        userPrivileges: undefined,
        docsInTimeRange: 100,
        quality: 'good',
        degradedDocs: {
          percentage: 0,
          count: 0,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
      {
        name: 'synth',
        type: 'logs',
        namespace: 'default',
        title: 'synth',
        rawName: 'logs-synth-default',
        lastActivity: undefined,
        size: undefined,
        sizeBytes: undefined,
        integration: undefined,
        totalDocs: undefined,
        userPrivileges: undefined,
        docsInTimeRange: 100,
        quality: 'poor',
        degradedDocs: {
          count: 6,
          percentage: 6,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
      {
        name: 'another',
        type: 'logs',
        namespace: 'default',
        title: 'another',
        rawName: 'logs-another-default',
        lastActivity: undefined,
        size: undefined,
        sizeBytes: undefined,
        integration: undefined,
        totalDocs: undefined,
        userPrivileges: undefined,
        docsInTimeRange: 100,
        quality: 'good',
        degradedDocs: {
          percentage: 0,
          count: 0,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
    ]);
  });

  it('merges integrations information with dataStreamStats', () => {
    const datasets = generateDatasets(dataStreamStats, [], [], integrations, totalDocs);

    expect(datasets).toEqual([
      {
        name: 'system.application',
        type: 'logs',
        namespace: 'default',
        title: 'Windows Application Events',
        rawName: 'logs-system.application-default',
        lastActivity: 1712911241117,
        size: '82.1kb',
        sizeBytes: 84160,
        integration: integrations[0],
        totalDocs: 100,
        userPrivileges: {
          canMonitor: true,
          canReadFailureStore: true,
        },
        quality: 'good',
        docsInTimeRange: 100,
        degradedDocs: {
          count: 0,
          percentage: 0,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: true,
      },
      {
        name: 'synth',
        type: 'logs',
        namespace: 'default',
        title: 'synth',
        rawName: 'logs-synth-default',
        lastActivity: 1712911241117,
        size: '62.5kb',
        sizeBytes: 64066,
        integration: undefined,
        totalDocs: 100,
        userPrivileges: {
          canMonitor: true,
          canReadFailureStore: true,
        },
        quality: 'good',
        docsInTimeRange: 100,
        degradedDocs: {
          count: 0,
          percentage: 0,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
    ]);
  });

  it('merges integration information with dataStreamStats when dataset is not an integration default one', () => {
    const nonDefaultDataset = {
      hasFailureStore: false,
      name: 'logs-system.custom-default',
      lastActivity: 1712911241117,
      size: '82.1kb',
      sizeBytes: 84160,
      totalDocs: 100,
      integration: 'system',
      userPrivileges: {
        canMonitor: true,
        canReadFailureStore: true,
      },
    };

    const datasets = generateDatasets([nonDefaultDataset], [], [], integrations, totalDocs);

    expect(datasets).toEqual([
      {
        name: 'system.custom',
        type: 'logs',
        namespace: 'default',
        title: 'system.custom',
        rawName: 'logs-system.custom-default',
        lastActivity: 1712911241117,
        size: '82.1kb',
        sizeBytes: 84160,
        integration: integrations[0],
        userPrivileges: {
          canMonitor: true,
          canReadFailureStore: true,
        },
        quality: 'good',
        totalDocs: 100,
        docsInTimeRange: 0,
        degradedDocs: {
          count: 0,
          percentage: 0,
        },
        failedDocs: {
          percentage: 0,
          count: 0,
        },
        hasFailureStore: false,
      },
    ]);
  });
});
