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
import { PROPOSALS_TELEMETRY_EVENTS, PROPOSALS_TELEMETRY_PREFIX } from './constants';
import type {
  ProposalsCallerFields,
  ProposalsProposalIdFields,
  ProposalsTelemetryEventPayloads,
} from './event_types';
import { PROPOSALS_TELEMETRY_EVENT_TYPES } from './event_types';
import { registerProposalsTelemetryEvents } from './register_telemetry_events';

/** Identity and free-text field names no proposals event may declare, at any nesting depth. */
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

/** The caller fields every event except the cluster-level snapshot carries. */
const CALLER_FIELD_NAMES = ['caller_run_id', 'consumer', 'is_default_space', 'managed_caller'];

/** The required ids every per-proposal event carries: its own, and its chain root's. */
const PROPOSAL_ID_FIELD_NAMES = ['proposal_id', 'root_proposal_id'];

/** The only events that describe an action, and so the only ones that carry `action_id`. */
const ACTION_EVENT_TYPES: string[] = [
  PROPOSALS_TELEMETRY_EVENTS.ProposalCreated,
  PROPOSALS_TELEMETRY_EVENTS.ActionExecuted,
];

/** Every id field any proposals event may carry, none of which the snapshot may. */
const ID_FIELD_NAMES = [...PROPOSAL_ID_FIELD_NAMES, 'action_id'];

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

const callerFields: ProposalsCallerFields = {
  caller_run_id: '0b6a1f4e-8c43-4a39-9a4e-1f7f5f3f9c10',
  consumer: 'alertzero',
  is_default_space: true,
  managed_caller: true,
};

const proposalIdFields: ProposalsProposalIdFields = {
  proposal_id: '5d0c2a8e-6f1b-4e8a-9c3d-2b7e4f6a1c90',
  root_proposal_id: '8a4e1f3c-2d6b-4c7a-8e9f-0b1c2d3e4f5a',
};

/** One valid payload per event, typed against the payload map so types and schemas agree. */
const FIXTURES: {
  [K in keyof ProposalsTelemetryEventPayloads]: ProposalsTelemetryEventPayloads[K];
} = {
  [PROPOSALS_TELEMETRY_EVENTS.ProposalCreated]: {
    ...callerFields,
    ...proposalIdFields,
    action_id: 'security-isolate-host',
    auto_approve_requested: false,
    category: 'respond',
    confidence_bucket: 'high',
    expires_in_bucket: 'le_72h',
    has_action: true,
    impact_class: 'critical',
  },
  [PROPOSALS_TELEMETRY_EVENTS.ProposalDecided]: {
    ...callerFields,
    ...proposalIdFields,
    attempt: 1,
    decided_after_deadline: false,
    decision: 'dismissed',
    decision_source: 'human',
    dismiss_reason: 'insufficient_evidence',
    time_to_decision_ms: 3_600_000,
  },
  [PROPOSALS_TELEMETRY_EVENTS.ProposalStatusChanged]: {
    ...callerFields,
    ...proposalIdFields,
    expiry_reason: 'deadline',
    from_status: 'pending',
    to_status: 'expired',
  },
  [PROPOSALS_TELEMETRY_EVENTS.ActionExecuted]: {
    ...callerFields,
    ...proposalIdFields,
    action_id: 'custom',
    attempt: 2,
    category: 'configure',
    execution_duration_ms: 12_000,
    outcome: 'failed',
  },
  [PROPOSALS_TELEMETRY_EVENTS.ProposalRevised]: {
    ...callerFields,
    ...proposalIdFields,
    action_input_changed: true,
    comment_changed: false,
    confidence_changed: false,
    impact_changed: true,
    revision: 2,
  },
  [PROPOSALS_TELEMETRY_EVENTS.ProposalRetried]: {
    ...callerFields,
    ...proposalIdFields,
    attempt: 2,
  },
  [PROPOSALS_TELEMETRY_EVENTS.ProposalResumeRejected]: {
    ...proposalIdFields,
    consumer: 'custom',
    is_default_space: false,
    managed_caller: false,
    reason: 'external_principal',
  },
  [PROPOSALS_TELEMETRY_EVENTS.Snapshot]: {
    executing_by_age: [{ age_bucket: 'le_1h', count: 1 }],
    pending_by_age: [
      { age_bucket: 'le_24h', count: 4 },
      { age_bucket: 'gt_7d', count: 1 },
    ],
    pending_overdue_by_age: [{ age_bucket: 'le_7d', count: 1 }],
    settled: [
      { count: 12, status: 'succeeded' },
      { count: 3, reason: 'deadline', status: 'expired' },
      { count: 1, reason: 'action', status: 'failed' },
    ],
    snapshot_day: '2026-09-28',
    space_count: 3,
  },
};

const README_PATH = join(__dirname, 'README.md');

/** Event names documented as `### \`proposals_…\`` headings in the telemetry README. */
const readDocumentedEventNames = (): string[] =>
  Array.from(readFileSync(README_PATH, 'utf8').matchAll(/^### `(proposals_[a-z0-9_]+)`\s*$/gm)).map(
    ([, eventName]) => eventName
  );

const registeredEventNames = PROPOSALS_TELEMETRY_EVENT_TYPES.map(({ eventType }) => eventType);

describe('proposals telemetry event types', () => {
  it('registers exactly the events in the event name map', () => {
    expect([...registeredEventNames].sort()).toEqual(
      Object.values(PROPOSALS_TELEMETRY_EVENTS).sort()
    );
  });

  it('registers each event name once', () => {
    expect(new Set(registeredEventNames).size).toBe(registeredEventNames.length);
  });

  it('names the eight events of the telemetry plan', () => {
    expect([...registeredEventNames].sort()).toEqual([
      'proposals_action_executed',
      'proposals_proposal_created',
      'proposals_proposal_decided',
      'proposals_proposal_resume_rejected',
      'proposals_proposal_retried',
      'proposals_proposal_revised',
      'proposals_proposal_status_changed',
      'proposals_snapshot',
    ]);
  });

  it.each(registeredEventNames.map((eventName) => [eventName]))(
    'prefixes %s with the plugin prefix',
    (eventName) => {
      expect(eventName.startsWith(`${PROPOSALS_TELEMETRY_PREFIX}_`)).toBe(true);
    }
  );

  it.each(
    PROPOSALS_TELEMETRY_EVENT_TYPES.filter(
      ({ eventType }) => eventType !== PROPOSALS_TELEMETRY_EVENTS.Snapshot
    ).map((opts) => [opts.eventType, opts])
  )('%s carries the caller fields', (_eventType, { schema }) => {
    expect(CALLER_FIELD_NAMES.filter((field) => !(field in schema))).toEqual([]);
  });

  it('keeps the snapshot free of caller fields, because it is a cluster-level aggregate', () => {
    const snapshot = PROPOSALS_TELEMETRY_EVENT_TYPES.find(
      ({ eventType }) => eventType === PROPOSALS_TELEMETRY_EVENTS.Snapshot
    );

    expect(CALLER_FIELD_NAMES.filter((field) => field in (snapshot?.schema ?? {}))).toEqual([]);
  });

  it('keeps the snapshot free of any proposal or action id, at any depth', () => {
    const snapshot = PROPOSALS_TELEMETRY_EVENT_TYPES.find(
      ({ eventType }) => eventType === PROPOSALS_TELEMETRY_EVENTS.Snapshot
    );

    expect(
      collectFields((snapshot?.schema ?? {}) as Record<string, unknown>)
        .filter(({ path }) => ID_FIELD_NAMES.includes(getLeafName(path)))
        .map(({ path }) => path)
    ).toEqual([]);
  });

  describe.each(
    PROPOSALS_TELEMETRY_EVENT_TYPES.filter(
      ({ eventType }) => eventType !== PROPOSALS_TELEMETRY_EVENTS.Snapshot
    ).map((opts) => [opts.eventType, opts])
  )('%s ids', (eventType, { schema }) => {
    const fields = schema as Record<string, Record<string, unknown>>;

    it.each(PROPOSAL_ID_FIELD_NAMES.map((field) => [field]))(
      'requires %s as a keyword',
      (field) => {
        expect(fields[field]).toEqual(
          expect.objectContaining({
            type: 'keyword',
            _meta: expect.objectContaining({ optional: false }),
          })
        );
      }
    );

    if (ACTION_EVENT_TYPES.includes(eventType)) {
      it('declares action_id as an optional keyword', () => {
        expect(fields.action_id).toEqual(
          expect.objectContaining({
            type: 'keyword',
            _meta: expect.objectContaining({ optional: true }),
          })
        );
      });
    } else {
      it('declares no action_id', () => {
        expect(fields).not.toHaveProperty('action_id');
      });
    }
  });

  describe.each(PROPOSALS_TELEMETRY_EVENT_TYPES.map((opts) => [opts.eventType, opts]))(
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
      registerProposalsTelemetryEvents(analytics);
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
