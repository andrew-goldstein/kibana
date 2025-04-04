/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  SavedObjectsClientContract,
  SavedObjectsFindResult,
} from '@kbn/core-saved-objects-api-server';
import { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { TLSRuleParams } from '@kbn/response-ops-rule-params/synthetics_tls';
import moment from 'moment';
import { MonitorConfigRepository } from '../../services/monitor_config_repository';
import { FINAL_SUMMARY_FILTER } from '../../../common/constants/client_defaults';
import { formatFilterString } from '../common';
import { SyntheticsServerSetup } from '../../types';
import { getSyntheticsCerts } from '../../queries/get_certs';
import { savedObjectsAdapter } from '../../saved_objects';
import { DYNAMIC_SETTINGS_DEFAULTS, SYNTHETICS_INDEX_PATTERN } from '../../../common/constants';
import { processMonitors } from '../../saved_objects/synthetics_monitor/get_all_monitors';
import {
  CertResult,
  ConfigKey,
  EncryptedSyntheticsMonitorAttributes,
  Ping,
} from '../../../common/runtime_types';
import { SyntheticsMonitorClient } from '../../synthetics_service/synthetics_monitor/synthetics_monitor_client';
import { monitorAttributes } from '../../../common/types/saved_objects';
import { AlertConfigKey } from '../../../common/constants/monitor_management';
import { SyntheticsEsClient } from '../../lib';

export class TLSRuleExecutor {
  previousStartedAt: Date | null;
  params: TLSRuleParams;
  esClient: SyntheticsEsClient;
  soClient: SavedObjectsClientContract;
  server: SyntheticsServerSetup;
  syntheticsMonitorClient: SyntheticsMonitorClient;
  monitors: Array<SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes>> = [];
  monitorConfigRepository: MonitorConfigRepository;

  constructor(
    previousStartedAt: Date | null,
    p: TLSRuleParams,
    soClient: SavedObjectsClientContract,
    scopedClient: ElasticsearchClient,
    server: SyntheticsServerSetup,
    syntheticsMonitorClient: SyntheticsMonitorClient
  ) {
    this.previousStartedAt = previousStartedAt;
    this.params = p;
    this.soClient = soClient;
    this.esClient = new SyntheticsEsClient(this.soClient, scopedClient, {
      heartbeatIndices: SYNTHETICS_INDEX_PATTERN,
    });
    this.server = server;
    this.syntheticsMonitorClient = syntheticsMonitorClient;
    this.monitorConfigRepository = new MonitorConfigRepository(
      soClient,
      server.encryptedSavedObjects.getClient()
    );
  }

  async getMonitors() {
    const HTTP_OR_TCP = `${monitorAttributes}.${ConfigKey.MONITOR_TYPE}: http or ${monitorAttributes}.${ConfigKey.MONITOR_TYPE}: tcp`;
    this.monitors = await this.monitorConfigRepository.getAll({
      filter: `${monitorAttributes}.${AlertConfigKey.TLS_ENABLED}: true and (${HTTP_OR_TCP})`,
    });

    const {
      allIds,
      enabledMonitorQueryIds,
      monitorLocationIds,
      monitorLocationsMap,
      projectMonitorsCount,
      monitorQueryIdToConfigIdMap,
    } = processMonitors(this.monitors);

    return {
      enabledMonitorQueryIds,
      monitorLocationIds,
      allIds,
      monitorLocationsMap,
      projectMonitorsCount,
      monitorQueryIdToConfigIdMap,
    };
  }

  async getExpiredCertificates() {
    const { enabledMonitorQueryIds } = await this.getMonitors();

    const dynamicSettings = await savedObjectsAdapter.getSyntheticsDynamicSettings(this.soClient);

    const expiryThreshold =
      this.params.certExpirationThreshold ??
      dynamicSettings?.certExpirationThreshold ??
      DYNAMIC_SETTINGS_DEFAULTS.certExpirationThreshold;

    const ageThreshold =
      this.params.certAgeThreshold ??
      dynamicSettings?.certAgeThreshold ??
      DYNAMIC_SETTINGS_DEFAULTS.certAgeThreshold;

    const absoluteExpirationThreshold = moment().add(expiryThreshold, 'd').valueOf();
    const absoluteAgeThreshold = moment().subtract(ageThreshold, 'd').valueOf();

    if (enabledMonitorQueryIds.length === 0) {
      return {
        latestPings: [],
        certs: [],
        total: 0,
        foundCerts: false,
        expiryThreshold,
        ageThreshold,
        absoluteExpirationThreshold,
        absoluteAgeThreshold,
      };
    }

    let filters: QueryDslQueryContainer | undefined;

    if (this.params.search) {
      filters = await formatFilterString(this.esClient, undefined, this.params.search);
    }

    const { certs, total }: CertResult = await getSyntheticsCerts({
      syntheticsEsClient: this.esClient,
      pageIndex: 0,
      size: 1000,
      notValidAfter: `now+${expiryThreshold}d`,
      notValidBefore: `now-${ageThreshold}d`,
      sortBy: 'common_name',
      direction: 'desc',
      filters,
      monitorIds: enabledMonitorQueryIds,
    });

    const latestPings = await this.getLatestPingsForMonitors(certs);

    const foundCerts = total > 0;

    return {
      latestPings,
      foundCerts,
      total,
      expiryThreshold,
      ageThreshold,
      absoluteExpirationThreshold,
      absoluteAgeThreshold,
      certs: this.filterOutResolvedCerts(certs, latestPings),
    };
  }

  filterOutResolvedCerts(certs: CertResult['certs'], latestPings: TLSLatestPing[]) {
    const latestPingsMap = new Map<string, TLSLatestPing>();
    latestPings.forEach((ping) => {
      latestPingsMap.set(ping.config_id!, ping);
    });
    return certs.filter((cert) => {
      const lPing = latestPingsMap.get(cert.configId);
      if (!lPing) {
        return true;
      }
      return moment(lPing['@timestamp']).isBefore(cert['@timestamp']);
    });
  }
  async getLatestPingsForMonitors(certs: CertResult['certs']) {
    if (certs.length === 0) {
      return [];
    }
    const configIds = certs.map((cert) => cert.configId);
    const certIds = certs.map((cert) => cert.sha256);
    const { body } = await this.esClient.search({
      query: {
        bool: {
          filter: [
            {
              range: {
                '@timestamp': {
                  gte: 'now-1d',
                  lt: 'now',
                },
              },
            },
            {
              terms: {
                config_id: configIds,
              },
            },
            FINAL_SUMMARY_FILTER,
          ],
          must_not: {
            bool: {
              filter: [
                {
                  terms: {
                    'tls.server.hash.sha256': certIds,
                  },
                },
              ],
            },
          },
        },
      },
      collapse: {
        field: 'config_id',
      },
      _source: ['@timestamp', 'monitor', 'url', 'config_id', 'tls'],
      sort: [
        {
          '@timestamp': {
            order: 'desc',
          },
        },
      ],
    });

    return body.hits.hits.map((hit) => hit._source as TLSLatestPing);
  }
}

export type TLSLatestPing = Pick<Ping, '@timestamp' | 'monitor' | 'url' | 'tls' | 'config_id'>;
