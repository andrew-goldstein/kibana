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
import {
  AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS,
  AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX,
} from './constants';
import type { AgenticInvestigationsTelemetryEventPayloads } from './event_types';
import { AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES } from './event_types';
import { registerAgenticInvestigationsTelemetryEvents } from './register_telemetry_events';

/** Identity and free-text field names no agentic_investigations event may declare, at any depth. */
const DENYLISTED_FIELD_NAMES = [
  'assignees',
  'collaborators',
  'comment',
  'description',
  'email',
  'message',
  'name',
  'rationale',
  'spaceId',
  'space_id',
  'summary',
  'title',
  'user',
  'username',
  'verdict',
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

const INVESTIGATION_ID = '5f0c3c8e-2d51-4b8a-9e0f-7c1d2b3a4e5f';
const ESCALATION_ID = '9a7b6c5d-4e3f-4a1b-8c2d-0e1f2a3b4c5d';

/** One valid payload per event, typed against the payload map so types and schemas agree. */
const FIXTURES: {
  [K in keyof AgenticInvestigationsTelemetryEventPayloads]: AgenticInvestigationsTelemetryEventPayloads[K];
} = {
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationOpened]: {
    investigation_id: INVESTIGATION_ID,
    is_default_space: true,
  },
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed]: {
    close_reason: 'false_positive',
    closed_by_class: 'user',
    dismiss_reason: 'wrong',
    investigation_id: INVESTIGATION_ID,
    is_default_space: false,
    proposals_open_at_close: 2,
    time_open_ms: 3_600_000,
  },
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationReopened]: {
    investigation_id: INVESTIGATION_ID,
    is_default_space: true,
  },
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationCreated]: {
    access_mode: 'private',
    escalation_id: ESCALATION_ID,
    investigation_id: INVESTIGATION_ID,
    is_default_space: true,
    linked_investigations_at_create: 1,
    participant_count: 2,
  },
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationInvestigationLinked]: {
    escalation_id: ESCALATION_ID,
    investigation_id: INVESTIGATION_ID,
    is_default_space: false,
    linked_investigation_count: 3,
  },
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed]: {
    escalation_id: ESCALATION_ID,
    investigations_closed: 2,
    is_default_space: true,
    linked_investigation_count: 3,
    time_open_ms: 86_400_000,
  },
};

/** The same fixtures with every optional field removed, to prove each is really optional. */
const MINIMAL_FIXTURES: Partial<{
  [K in keyof AgenticInvestigationsTelemetryEventPayloads]: AgenticInvestigationsTelemetryEventPayloads[K];
}> = {
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.InvestigationClosed]: {
    closed_by_class: 'escalation_cascade',
    investigation_id: INVESTIGATION_ID,
    is_default_space: true,
    proposals_open_at_close: 0,
  },
  [AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS.EscalationClosed]: {
    escalation_id: ESCALATION_ID,
    investigations_closed: 0,
    is_default_space: true,
    linked_investigation_count: 0,
  },
};

const README_PATH = join(__dirname, 'README.md');

/** Event names documented as `### \`agentic_investigations_…\`` headings in the telemetry README. */
const readDocumentedEventNames = (): string[] =>
  Array.from(
    readFileSync(README_PATH, 'utf8').matchAll(/^### `(agentic_investigations_[a-z0-9_]+)`\s*$/gm)
  ).map(([, eventName]) => eventName);

const registeredEventNames = AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES.map(
  ({ eventType }) => eventType
);

describe('agentic_investigations telemetry event types', () => {
  it('registers exactly the events in the event name map', () => {
    expect([...registeredEventNames].sort()).toEqual(
      Object.values(AGENTIC_INVESTIGATIONS_TELEMETRY_EVENTS).sort()
    );
  });

  it('registers each event name once', () => {
    expect(new Set(registeredEventNames).size).toBe(registeredEventNames.length);
  });

  it.each(registeredEventNames.map((eventName) => [eventName]))(
    'prefixes %s with the plugin prefix',
    (eventName) => {
      expect(eventName.startsWith(`${AGENTIC_INVESTIGATIONS_TELEMETRY_PREFIX}_`)).toBe(true);
    }
  );

  describe.each(AGENTIC_INVESTIGATIONS_TELEMETRY_EVENT_TYPES.map((opts) => [opts.eventType, opts]))(
    '%s schema',
    (_eventType, { schema }) => {
      const fields = collectFields(schema as Record<string, unknown>);

      it('declares at least one field', () => {
        expect(fields.length).toBeGreaterThan(0);
      });

      it('carries is_default_space', () => {
        expect(fields.map(({ path }) => path)).toContain('is_default_space');
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
      registerAgenticInvestigationsTelemetryEvents(analytics);
      return analytics;
    };

    it.each(Object.entries(FIXTURES))('accepts a valid %s payload', (eventType, payload) => {
      const analytics = createRegisteredAnalytics();

      expect(() => analytics.reportEvent(eventType, payload)).not.toThrow();
    });

    it.each(Object.entries(MINIMAL_FIXTURES))(
      'accepts a %s payload without its optional fields',
      (eventType, payload) => {
        const analytics = createRegisteredAnalytics();

        expect(() => analytics.reportEvent(eventType, payload)).not.toThrow();
      }
    );

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
