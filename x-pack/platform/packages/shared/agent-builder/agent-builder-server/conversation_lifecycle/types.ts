/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MaybePromise } from '@kbn/utility-types';
import type { SerializedMetadataValue } from '@kbn/agent-builder-common';

/**
 * Selects which conversations and metadata fields a lifecycle listener receives.
 */
export interface ConversationLifecycleFilter {
  /** Template ids to subscribe to. Must not be empty: conversations without a match are never delivered. */
  templateIds: readonly string[];
  /** Metadata fields to receive. Values of any other field are never exposed to the listener. */
  fields: readonly string[];
}

/** A write made through an HTTP route. */
export interface ConversationLifecycleHttpApiSource {
  type: 'http_api';
}

/** A write made by an agent execution, including conversations created while running an agent. */
export interface ConversationLifecycleExecutionSource {
  type: 'execution';
}

/** A write made by another plugin through the Agent Builder start contract. */
export interface ConversationLifecycleServerApiSource {
  type: 'server_api';
}

/**
 * A write made by a workflow step. The workflow details come from the step's execution context;
 * they are absent when the write was made without one, in which case it is not attributable.
 */
export interface ConversationLifecycleWorkflowSource {
  type: 'workflow';
  /** Id of the workflow running the step. */
  workflowId?: string;
  /** Id of the workflow execution running the step. */
  workflowExecutionId?: string;
  /** True when the step runs as part of a workflow test run. */
  isTestRun?: boolean;
}

/**
 * What made a conversation write. Bound when the conversation client is constructed; callers
 * cannot set it.
 */
export type ConversationLifecycleSource =
  | ConversationLifecycleHttpApiSource
  | ConversationLifecycleExecutionSource
  | ConversationLifecycleServerApiSource
  | ConversationLifecycleWorkflowSource;

/**
 * The stored (serialized) value of a metadata field before and after a write. A side is omitted
 * when the field is unset on that side.
 */
export interface ConversationLifecycleFieldChange {
  previous?: SerializedMetadataValue;
  next?: SerializedMetadataValue;
}

/** Changed metadata fields, keyed by field name and limited to the listener's subscribed fields. */
export type ConversationLifecycleChanges = Record<string, ConversationLifecycleFieldChange>;

interface ConversationLifecycleEventBase {
  /** Id of the space the conversation belongs to. */
  spaceId: string;
  conversationId: string;
  /** Id of the conversation's template. */
  templateId: string;
  /** Version of the conversation's template, when recorded. */
  templateVersion?: number;
  changes: ConversationLifecycleChanges;
  source: ConversationLifecycleSource;
}

/**
 * A conversation was created. `changes` holds the subscribed fields that have a value after the
 * write (template defaults included), with `next` only.
 */
export type ConversationLifecycleCreatedEvent = ConversationLifecycleEventBase;

/**
 * Conversation metadata was updated, by a metadata patch, a template (re-)application or an update
 * that replaces the metadata. `changes` holds only the subscribed fields whose stored value changed.
 */
export type ConversationLifecycleMetadataUpdatedEvent = ConversationLifecycleEventBase;

/** Listener for {@link ConversationLifecycleCreatedEvent}. Called after the write, never blocking it. */
export type ConversationLifecycleCreatedListener = (
  event: ConversationLifecycleCreatedEvent
) => MaybePromise<void>;

/** Listener for {@link ConversationLifecycleMetadataUpdatedEvent}. Called after the write, never blocking it. */
export type ConversationLifecycleMetadataUpdatedListener = (
  event: ConversationLifecycleMetadataUpdatedEvent
) => MaybePromise<void>;
