/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { createAnalytics } from '@elastic/ebt/client';
import { loggerMock } from '@kbn/logging-mocks';
import { INVESTIGATION_CLOSE_REASONS } from '../../common/telemetry/constants';
import {
  ALERTZERO_TELEMETRY_EVENTS,
  ALERTZERO_TELEMETRY_PREFIX,
  SCHEDULE_INTERVAL_BUCKETS,
  WORKER_ENABLED_VALUES,
  WORKER_SETTINGS,
} from './constants';
import type { AlertZeroEnvelope, AlertZeroTelemetryEventPayloads } from './event_types';
import {
  ALERTZERO_AD_WORKER_INVESTIGATION_CLOSED_EVENT,
  ALERTZERO_AD_WORKER_RUN_COMPLETED_EVENT,
  ALERTZERO_FEATURE_FLAGS_SNAPSHOT_EVENT,
  ALERTZERO_TELEMETRY_EVENT_TYPES,
  ALERTZERO_WORKER_SETTINGS_CHANGED_EVENT,
} from './event_types';
import { registerAlertZeroTelemetryEvents } from './register_telemetry_events';
import { SNAPSHOT_FLAGS } from './snapshot/constants';

/** Identity and free-text field names no AlertZero event may declare, at any nesting depth. */
const DENYLISTED_FIELD_NAMES = [
  'actionInput',
  'comment',
  'decidedBy',
  'description',
  'email',
  'executionError',
  'message',
  'name',
  'rationale',
  'spaceId',
  'space_id',
  'title',
  'user',
  'username',
];

/** Imports that would couple telemetry to request identity or audit data. */
const FORBIDDEN_IMPORTS = ['KibanaRequest', 'ProposalUser'];

interface SchemaField {
  path: string;
  node: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/** Every declared field, including object properties and array items, with its dotted path. */
const collectFields = (properties: Record<string, unknown>, prefix = ''): SchemaField[] =>
  Object.entries(properties).flatMap(([key, node]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!isRecord(node)) {
      return [{ node: {}, path }];
    }
    const items = isRecord(node.items) ? node.items : undefined;
    const nestedProperties = isRecord(node.properties)
      ? node.properties
      : isRecord(items?.properties)
      ? items?.properties
      : undefined;
    const nested = isRecord(nestedProperties) ? collectFields(nestedProperties, path) : [];
    return [{ node, path }, ...nested];
  });

const getDescription = (node: Record<string, unknown>): unknown =>
  isRecord(node._meta) ? node._meta.description : undefined;

const getLeafName = (path: string): string => path.split('.').pop() ?? path;

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return listSourceFiles(fullPath);
    }
    return /\.tsx?$/.test(entry) ? [fullPath] : [];
  });

/** Names bound or re-exported by every import/export declaration in a source file. */
const collectImportedNames = (filePath: string): string[] => {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  return source.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      const named =
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => (element.propertyName ?? element.name).text)
          : [];
      const defaultName = statement.importClause?.name?.text;
      return defaultName ? [defaultName, ...named] : named;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      return statement.exportClause.elements.map(
        (element) => (element.propertyName ?? element.name).text
      );
    }
    return [];
  });
};

const envelope: AlertZeroEnvelope = {
  autonomy_level: 'supervised',
  autonomy_mode: 'auto_accept',
  execution_id: 'c5d0e2a9-3b7e-4c61-8f2d-6a9b0e4d7f21',
  is_default_space: true,
  run_id: '0b6a1f4e-8c43-4a39-9a4e-1f7f5f3f9c10',
  trigger_type: 'scheduled',
  watch_tag: 'watch-floor',
  worker_id: 'system-security-floor-attack-discovery',
};

/** One valid payload per event, typed against the payload map so types and schemas agree. */
const FIXTURES: {
  [K in keyof AlertZeroTelemetryEventPayloads]: AlertZeroTelemetryEventPayloads[K];
} = {
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerRunCompleted]: {
    ...envelope,
    alerts_analyzed: 120,
    attacks_generated: 4,
    attacks_persisted: 3,
    batches_failed: 0,
    batches_total: 2,
    run_outcome: 'produced',
  },
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerReviewStarted]: {
    ...envelope,
    investigation_id: '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f',
    is_rereview: false,
  },
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerAnalysisCompleted]: {
    ...envelope,
    analysis_error: false,
    verdict: 'true_positive',
  },
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerHandoffResolved]: {
    ...envelope,
    auto_approve_requested: true,
    outcome: 'approved',
    verdict: 'true_positive',
  },
  [ALERTZERO_TELEMETRY_EVENTS.AdWorkerInvestigationClosed]: {
    ...envelope,
    close_reason: 'false_positive',
    investigation_id: '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f',
  },
  [ALERTZERO_TELEMETRY_EVENTS.WorkerSettingsChanged]: {
    bulk_write: true,
    is_default_space: false,
    next_value: 'assisted',
    previous_value: 'manual',
    setting: 'autonomy',
    settings_revision: 4,
    watch_tag: 'watch-detection',
    worker_id: 'system-security-detection-rule-tuning',
  },
  [ALERTZERO_TELEMETRY_EVENTS.WorkerActivated]: {
    autonomy_level: 'manual',
    enabled: true,
    is_default_space: true,
    watch_tag: 'watch-floor',
    worker_id: 'system-security-floor-attack-discovery',
  },
  [ALERTZERO_TELEMETRY_EVENTS.AutonomySnapshot]: {
    snapshot_day: '2026-09-28',
    space_count: 3,
    workers: [
      {
        autonomy_level: 'manual',
        count: 2,
        enabled: true,
        worker_id: 'system-security-floor-attack-discovery',
      },
    ],
  },
  [ALERTZERO_TELEMETRY_EVENTS.FeatureFlagsSnapshot]: {
    flags: [{ enabled_space_count: 1, flag: 'securitySolution:enableAlertZero' }],
    snapshot_day: '2026-09-28',
    space_count: 3,
  },
};

const README_PATH = join(__dirname, 'README.md');

/** Event names documented as `### \`alertzero_…\`` headings in the telemetry README. */
const readDocumentedEventNames = (): string[] =>
  Array.from(readFileSync(README_PATH, 'utf8').matchAll(/^### `(alertzero_[a-z0-9_]+)`\s*$/gm)).map(
    ([, eventName]) => eventName
  );

/** The README text under one event's `### \`alertzero_…\`` heading, up to the next heading. */
const readDocumentedEventSection = (eventName: string): string => {
  const [, afterHeading = ''] = readFileSync(README_PATH, 'utf8').split(`### \`${eventName}\`\n`);
  const [section] = afterHeading.split(/^#{2,3} /m);
  return section;
};

const registeredEventNames = ALERTZERO_TELEMETRY_EVENT_TYPES.map(({ eventType }) => eventType);

describe('AlertZero telemetry event types', () => {
  it('registers exactly the events in the event name map', () => {
    expect([...registeredEventNames].sort()).toEqual(
      Object.values(ALERTZERO_TELEMETRY_EVENTS).sort()
    );
  });

  it('registers no Investigation lifecycle event, which nothing in AlertZero emits', () => {
    expect(
      registeredEventNames.filter((eventName) =>
        eventName.startsWith(`${ALERTZERO_TELEMETRY_PREFIX}_investigation_`)
      )
    ).toEqual([]);
  });

  it('registers each event name once', () => {
    expect(new Set(registeredEventNames).size).toBe(registeredEventNames.length);
  });

  it.each(registeredEventNames.map((eventName) => [eventName]))(
    'prefixes %s with the plugin prefix',
    (eventName) => {
      expect(eventName.startsWith(`${ALERTZERO_TELEMETRY_PREFIX}_`)).toBe(true);
    }
  );

  describe.each(ALERTZERO_TELEMETRY_EVENT_TYPES.map((opts) => [opts.eventType, opts]))(
    '%s schema',
    (_eventType, { schema }) => {
      const fields = collectFields(schema as Record<string, unknown>);

      it('declares at least one field', () => {
        expect(fields.length).toBeGreaterThan(0);
      });

      it('gives every field a non-empty description', () => {
        const undescribed = fields
          .filter(({ node }) => {
            const description = getDescription(node);
            return typeof description !== 'string' || description.trim().length === 0;
          })
          .map(({ path }) => path);

        expect(undescribed).toEqual([]);
      });

      it('uses no `text` field', () => {
        const textFields = fields
          .filter(
            ({ node }) =>
              node.type === 'text' || (isRecord(node.items) && node.items.type === 'text')
          )
          .map(({ path }) => path);

        expect(textFields).toEqual([]);
      });

      it('declares no denylisted identity or free-text field name', () => {
        const denylisted = fields
          .filter(({ path }) => DENYLISTED_FIELD_NAMES.includes(getLeafName(path)))
          .map(({ path }) => path);

        expect(denylisted).toEqual([]);
      });

      it('uses no `pass_through` field, keeping the schema closed', () => {
        const passThrough = fields
          .filter(({ node }) => node.type === 'pass_through')
          .map(({ path }) => path);

        expect(passThrough).toEqual([]);
      });
    }
  );

  describe('README', () => {
    it('documents every registered event', () => {
      const documented = readDocumentedEventNames();

      expect(registeredEventNames.filter((eventName) => !documented.includes(eventName))).toEqual(
        []
      );
    });

    it('documents no event that is not registered', () => {
      const documented = readDocumentedEventNames();

      expect(documented.filter((eventName) => !registeredEventNames.includes(eventName))).toEqual(
        []
      );
    });

    it('has a privacy contract section', () => {
      expect(readFileSync(README_PATH, 'utf8')).toMatch(/^## Privacy contract$/m);
    });

    it('documents every schedule interval bucket and settings name', () => {
      const readme = readFileSync(README_PATH, 'utf8');

      expect(
        [...SCHEDULE_INTERVAL_BUCKETS, ...WORKER_SETTINGS].filter(
          (value) => !readme.includes(`\`${value}\``)
        )
      ).toEqual([]);
    });

    it('lists every settings name and enabled value in the settings_changed section', () => {
      const section = readDocumentedEventSection(ALERTZERO_TELEMETRY_EVENTS.WorkerSettingsChanged);

      expect(
        [...WORKER_SETTINGS, ...WORKER_ENABLED_VALUES].filter(
          (value) => !section.includes(`\`${value}\``)
        )
      ).toEqual([]);
    });
  });

  describe('alertzero_worker_settings_changed enabled changes', () => {
    const { schema } = ALERTZERO_WORKER_SETTINGS_CHANGED_EVENT;
    const fieldDescription = (field: keyof typeof schema): unknown =>
      getDescription(schema[field] as unknown as Record<string, unknown>);

    it('reports the Worker enabled state as the `enabled` setting', () => {
      expect(WORKER_SETTINGS).toContain('enabled');
      expect(fieldDescription('setting')).toContain('`enabled`');
    });

    it.each([['next_value'], ['previous_value']] as const)(
      'documents the keyword strings `true` and `false` in %s',
      (field) => {
        expect(fieldDescription(field)).toEqual(expect.stringContaining('`true`'));
        expect(fieldDescription(field)).toEqual(expect.stringContaining('`false`'));
      }
    );

    it.each([
      ['true', 'false'],
      ['false', 'true'],
    ])('accepts an enabled change from %s to %s in dev mode', (previousValue, nextValue) => {
      const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
      registerAlertZeroTelemetryEvents(analytics);

      expect(() =>
        analytics.reportEvent(ALERTZERO_TELEMETRY_EVENTS.WorkerSettingsChanged, {
          bulk_write: false,
          is_default_space: true,
          next_value: nextValue,
          previous_value: previousValue,
          setting: 'enabled',
          watch_tag: 'watch-floor',
          worker_id: 'system-security-floor-attack-discovery',
        })
      ).not.toThrow();
    });
  });

  describe('trigger_type', () => {
    it("documents that `workflow_step` is the engine's `workflow-step`", () => {
      const description = String(
        getDescription(
          ALERTZERO_AD_WORKER_RUN_COMPLETED_EVENT.schema.trigger_type as unknown as Record<
            string,
            unknown
          >
        )
      );
      const readme = readFileSync(README_PATH, 'utf8');

      expect({
        readme: ['`workflow_step`', '`workflow-step`'].every((value) => readme.includes(value)),
        schema: ['`workflow_step`', '`workflow-step`'].every((value) =>
          description.includes(value)
        ),
      }).toEqual({ readme: true, schema: true });
    });
  });

  describe('alertzero_feature_flags_snapshot flags', () => {
    it('lists every allowlisted flag in the schema and README', () => {
      const flagField = collectFields(
        ALERTZERO_FEATURE_FLAGS_SNAPSHOT_EVENT.schema as unknown as Record<string, unknown>
      ).find(({ path }) => path === 'flags.flag');
      const description = String(flagField ? getDescription(flagField.node) : '');
      const section = readDocumentedEventSection(ALERTZERO_TELEMETRY_EVENTS.FeatureFlagsSnapshot);

      expect({
        readme: SNAPSHOT_FLAGS.filter((flag) => !section.includes(`\`${flag}\``)),
        schema: SNAPSHOT_FLAGS.filter((flag) => !description.includes(`\`${flag}\``)),
      }).toEqual({ readme: [], schema: [] });
    });
  });

  describe('alertzero_ad_worker_investigation_closed', () => {
    const { schema } = ALERTZERO_AD_WORKER_INVESTIGATION_CLOSED_EVENT;

    it('carries the envelope plus only the Investigation id and close reason', () => {
      expect(Object.keys(schema).sort()).toEqual(
        [...Object.keys(envelope), 'close_reason', 'investigation_id'].sort()
      );
    });

    it.each([['close_reason'], ['investigation_id']] as const)('requires %s', (field) => {
      expect(schema[field]._meta).toEqual(expect.objectContaining({ optional: false }));
    });

    it('documents every Investigation template close reason in the schema and README', () => {
      const description = String(
        getDescription(schema.close_reason as unknown as Record<string, unknown>)
      );
      const section = readDocumentedEventSection(
        ALERTZERO_TELEMETRY_EVENTS.AdWorkerInvestigationClosed
      );

      expect({
        readme: INVESTIGATION_CLOSE_REASONS.filter((reason) => !section.includes(`\`${reason}\``)),
        schema: INVESTIGATION_CLOSE_REASONS.filter(
          (reason) => !description.includes(`\`${reason}\``)
        ),
      }).toEqual({ readme: [], schema: [] });
    });

    it.each(INVESTIGATION_CLOSE_REASONS.map((reason) => [reason]))(
      'accepts a %s close in dev mode',
      (closeReason) => {
        const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
        registerAlertZeroTelemetryEvents(analytics);

        expect(() =>
          analytics.reportEvent(ALERTZERO_TELEMETRY_EVENTS.AdWorkerInvestigationClosed, {
            ...FIXTURES[ALERTZERO_TELEMETRY_EVENTS.AdWorkerInvestigationClosed],
            close_reason: closeReason,
          })
        ).not.toThrow();
      }
    );

    it.each([['close_reason'], ['investigation_id']] as const)(
      'rejects a payload without %s in dev mode',
      (field) => {
        const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
        registerAlertZeroTelemetryEvents(analytics);
        const { [field]: _omitted, ...payload } =
          FIXTURES[ALERTZERO_TELEMETRY_EVENTS.AdWorkerInvestigationClosed];

        expect(() =>
          analytics.reportEvent(ALERTZERO_TELEMETRY_EVENTS.AdWorkerInvestigationClosed, payload)
        ).toThrow();
      }
    );
  });

  describe('audit separation', () => {
    const sourceFiles = listSourceFiles(__dirname);

    it('scans the telemetry sources', () => {
      expect(sourceFiles.length).toBeGreaterThan(0);
    });

    it.each(sourceFiles.map((filePath) => [filePath.replace(`${__dirname}/`, ''), filePath]))(
      '%s imports neither KibanaRequest nor ProposalUser',
      (_relativePath, filePath) => {
        const forbidden = collectImportedNames(filePath).filter((name) =>
          FORBIDDEN_IMPORTS.includes(name)
        );

        expect(forbidden).toEqual([]);
      }
    );
  });

  describe('dev-mode schema conformance', () => {
    const createRegisteredAnalytics = () => {
      const analytics = createAnalytics({ isDev: true, logger: loggerMock.create() });
      registerAlertZeroTelemetryEvents(analytics);
      return analytics;
    };

    it.each(Object.entries(FIXTURES))('accepts a valid %s payload', (eventType, payload) => {
      const analytics = createRegisteredAnalytics();

      expect(() => analytics.reportEvent(eventType, payload)).not.toThrow();
    });

    it.each(Object.entries(FIXTURES))(
      'rejects a %s payload carrying an undeclared field',
      (eventType, payload) => {
        const analytics = createRegisteredAnalytics();

        expect(() =>
          analytics.reportEvent(eventType, { ...payload, space_id: 'security-team' })
        ).toThrow();
      }
    );
  });
});
