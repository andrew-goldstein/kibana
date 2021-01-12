/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { TimelineEventsType } from '../../../../common/types/timeline';
import { QueryOperator } from '../timeline/data_providers/data_provider';

export const getTimelineId = (sampleEventId: string) => `row-renderer-editor-${sampleEventId}`;

export const isAlert = (eventType: Omit<TimelineEventsType, 'all'>) =>
  eventType === 'alert' || eventType === 'signal';

/**
 * An example field, `user.name`, encoded as Markdown in the format used by the
 * Row Renderer Editor
 */
export const EXAMPLE_USER_FIELD_MARKDOWN =
  '!{field{"icon": "user", "name": "user.name", "value": "foozle", "operator": ":", "palette": "2", "categories": 5}}';

export const EXAMPLE_PROCESS_FIELD_MARKDOWN =
  '!{field{"icon": "console", "name": "process.name", "value": "foo.exe", "operator": ":", "palette": "2", "categories": 5}}';

export interface ParsedField {
  icon?: string;
  name: string;
  operator: QueryOperator;
  value?: string | number;
}
