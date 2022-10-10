/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty, get } from 'lodash/fp';
import memoizeOne from 'memoize-one';
import type { CSSProperties } from 'react';

import {
  handleSkipFocus,
  elementOrChildrenHasFocus,
  getFocusedAriaColindexCell,
  getTableSkipFocus,
  stopPropagationAndPreventDefault,
} from '@kbn/timelines-plugin/public';
import { escapeQueryValue } from '../../../common/lib/kuery';

import type { DataProvider, DataProvidersAnd } from './data_providers/data_provider';
import { DataProviderType, EXISTS_OPERATOR } from './data_providers/data_provider';
import type { BrowserFields } from '../../../common/containers/source';

import { EVENTS_TABLE_CLASS_NAME } from './styles';

const isNumber = (value: string | number) => !isNaN(Number(value));

const convertDateFieldToQuery = (field: string, value: string | number) =>
  `${field}: ${isNumber(value) ? value : new Date(value).valueOf()}`;

const getBaseFields = memoizeOne((browserFields: BrowserFields): string[] => {
  const baseFields = get('base', browserFields);
  if (baseFields != null && baseFields.fields != null) {
    return Object.keys(baseFields.fields);
  }
  return [];
});

const getBrowserFieldPath = (field: string, browserFields: BrowserFields) => {
  const splitFields = field.split('.');
  const baseFields = getBaseFields(browserFields);
  if (baseFields.includes(field)) {
    return ['base', 'fields', field];
  }
  return [splitFields[0], 'fields', field];
};

const checkIfFieldTypeIsDate = (field: string, browserFields: BrowserFields) => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  if (browserField != null && browserField.type === 'date') {
    return true;
  }
  return false;
};

const convertNestedFieldToQuery = (
  field: string,
  value: string | number,
  browserFields: BrowserFields
) => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  const nestedPath = browserField.subType.nested.path;
  const key = field.replace(`${nestedPath}.`, '');
  return `${nestedPath}: { ${key}: ${browserField.type === 'date' ? `"${value}"` : value} }`;
};

const convertNestedFieldToExistQuery = (field: string, browserFields: BrowserFields) => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  const nestedPath = browserField.subType.nested.path;
  const key = field.replace(`${nestedPath}.`, '');
  return `${nestedPath}: { ${key}: * }`;
};

const checkIfFieldTypeIsNested = (field: string, browserFields: BrowserFields) => {
  const pathBrowserField = getBrowserFieldPath(field, browserFields);
  const browserField = get(pathBrowserField, browserFields);
  if (browserField != null && browserField.subType && browserField.subType.nested) {
    return true;
  }
  return false;
};

const buildQueryMatch = (
  dataProvider: DataProvider | DataProvidersAnd,
  browserFields: BrowserFields
) =>
  `${dataProvider.excluded ? 'NOT ' : ''}${
    dataProvider.queryMatch.operator !== EXISTS_OPERATOR &&
    dataProvider.type !== DataProviderType.template
      ? checkIfFieldTypeIsNested(dataProvider.queryMatch.field, browserFields)
        ? convertNestedFieldToQuery(
            dataProvider.queryMatch.field,
            dataProvider.queryMatch.value,
            browserFields
          )
        : checkIfFieldTypeIsDate(dataProvider.queryMatch.field, browserFields)
        ? convertDateFieldToQuery(dataProvider.queryMatch.field, dataProvider.queryMatch.value)
        : `${dataProvider.queryMatch.field} : ${
            isNumber(dataProvider.queryMatch.value)
              ? dataProvider.queryMatch.value
              : escapeQueryValue(dataProvider.queryMatch.value)
          }`
      : checkIfFieldTypeIsNested(dataProvider.queryMatch.field, browserFields)
      ? convertNestedFieldToExistQuery(dataProvider.queryMatch.field, browserFields)
      : `${dataProvider.queryMatch.field} ${EXISTS_OPERATOR}`
  }`.trim();

export const buildGlobalQuery = (dataProviders: DataProvider[], browserFields: BrowserFields) =>
  dataProviders
    .reduce((queries: string[], dataProvider: DataProvider) => {
      const flatDataProviders = [dataProvider, ...dataProvider.and];
      const activeDataProviders = flatDataProviders.filter(
        (flatDataProvider) => flatDataProvider.enabled
      );

      if (!activeDataProviders.length) return queries;

      const activeDataProvidersQueries = activeDataProviders.map((activeDataProvider) =>
        buildQueryMatch(activeDataProvider, browserFields)
      );

      const activeDataProvidersQueryMatch = activeDataProvidersQueries.join(' and ');

      return [...queries, activeDataProvidersQueryMatch];
    }, [])
    .filter((queriesItem) => !isEmpty(queriesItem))
    .reduce((globalQuery: string, queryMatch: string, index: number, queries: string[]) => {
      if (queries.length <= 1) return queryMatch;

      return !index ? `(${queryMatch})` : `${globalQuery} or (${queryMatch})`;
    }, '');

/**
 * The CSS class name of a "stateful event", which appears in both
 * the `Timeline` and the `Events Viewer` widget
 */
export const STATEFUL_EVENT_CSS_CLASS_NAME = 'event-column-view';

export const resolverIsShowing = (graphEventId: string | undefined): boolean =>
  graphEventId != null && graphEventId !== '';

export const showGlobalFilters = ({
  globalFullScreen,
  graphEventId,
}: {
  globalFullScreen: boolean;
  graphEventId: string | undefined;
}): boolean => (globalFullScreen && resolverIsShowing(graphEventId) ? false : true);

/**
 * The `aria-colindex` of the Timeline actions column
 */
export const ACTIONS_COLUMN_ARIA_COL_INDEX = '1';

/**
 * Every column index offset by `2`, because, per https://www.w3.org/TR/wai-aria-practices-1.1/examples/grid/dataGrids.html
 * the `aria-colindex` attribute starts at `1`, and the "actions column" is always the first column
 */
export const ARIA_COLUMN_INDEX_OFFSET = 2;

export const EVENTS_COUNT_BUTTON_CLASS_NAME = 'local-events-count-button';

/** Calculates the total number of pages in a (timeline) events view */
export const calculateTotalPages = ({
  itemsCount,
  itemsPerPage,
}: {
  itemsCount: number;
  itemsPerPage: number;
}): number => (itemsCount === 0 || itemsPerPage === 0 ? 0 : Math.ceil(itemsCount / itemsPerPage));

/** Returns true if the events table has focus */
export const tableHasFocus = (containerElement: HTMLElement | null): boolean =>
  elementOrChildrenHasFocus(
    containerElement?.querySelector<HTMLDivElement>(`.${EVENTS_TABLE_CLASS_NAME}`)
  );

/**
 * This function has a side effect. It will skip focus "after" or "before"
 * Timeline's events table, with exceptions as noted below.
 *
 * If the currently-focused table cell has additional focusable children,
 * i.e. action buttons, draggables, or always-open popover content, the
 * browser's "natural" focus management will determine which element is
 * focused next.
 */
export const onTimelineTabKeyPressed = ({
  containerElement,
  keyboardEvent,
  onSkipFocusBeforeEventsTable,
  onSkipFocusAfterEventsTable,
}: {
  containerElement: HTMLElement | null;
  keyboardEvent: React.KeyboardEvent;
  onSkipFocusBeforeEventsTable: () => void;
  onSkipFocusAfterEventsTable: () => void;
}) => {
  const { shiftKey } = keyboardEvent;

  const eventsTableSkipFocus = getTableSkipFocus({
    containerElement,
    getFocusedCell: getFocusedAriaColindexCell,
    shiftKey,
    tableHasFocus,
    tableClassName: EVENTS_TABLE_CLASS_NAME,
  });

  if (eventsTableSkipFocus !== 'SKIP_FOCUS_NOOP') {
    stopPropagationAndPreventDefault(keyboardEvent);
    handleSkipFocus({
      onSkipFocusBackwards: onSkipFocusBeforeEventsTable,
      onSkipFocusForward: onSkipFocusAfterEventsTable,
      skipFocus: eventsTableSkipFocus,
    });
  }
};

export const ACTIVE_TIMELINE_BUTTON_CLASS_NAME = 'active-timeline-button';
export const FLYOUT_BUTTON_BAR_CLASS_NAME = 'timeline-flyout-button-bar';

/**
 * This function focuses the active timeline button on the next tick. Focus
 * is updated on the next tick because this function is typically
 * invoked in `onClick` handlers that also dispatch Redux actions (that
 * in-turn update focus states).
 */
export const focusActiveTimelineButton = () => {
  setTimeout(() => {
    document
      .querySelector<HTMLButtonElement>(
        `div.${FLYOUT_BUTTON_BAR_CLASS_NAME} .${ACTIVE_TIMELINE_BUTTON_CLASS_NAME}`
      )
      ?.focus();
  }, 0);
};

/**
 * Focuses the utility bar action contained by the provided `containerElement`
 * when a valid container is provided
 */
export const focusUtilityBarAction = (containerElement: HTMLElement | null) => {
  containerElement
    ?.querySelector<HTMLButtonElement>('div.siemUtilityBar__action:last-of-type button')
    ?.focus();
};

/**
 * Resets keyboard focus on the page
 */
export const resetKeyboardFocus = () => {
  document.querySelector<HTMLAnchorElement>('header.headerGlobalNav a.euiHeaderLogo')?.focus();
};

export const TIMELINE_TAB_BEGINS_AT = 250; // px
export const TIMELINE_HEADER_DEFAULT_HEIGHT = 287; // px

export const getHeaderHeight = (dataProviderCount: number): number => {
  const ZERO_PROVIDERS_HEIGHT = 285;
  const ONE_PROVIDER_HEIGHT = 270;
  const ADDITIONAL_PROVIDER_HEIGHT = 45;

  return dataProviderCount === 0
    ? ZERO_PROVIDERS_HEIGHT
    : ONE_PROVIDER_HEIGHT + (dataProviderCount - 1) * ADDITIONAL_PROVIDER_HEIGHT;
};

const fallbackDocumentHeight = 300; // a fallback when clientHeight is zero

export const getDocumentHeight = (fallbackHeight: number): number =>
  document.documentElement.clientHeight > 0
    ? document.documentElement.clientHeight
    : fallbackHeight;

/**
 * Returns the initial size of the timeline header as a percentage, for use
 * with the `EuiResizablePanel` initialSize prop
 */
export const getTimelineHeaderInitialSizePercent = (dataProviderCount: number): number => {
  const documentHeight = getDocumentHeight(fallbackDocumentHeight);
  const headerHeight = getHeaderHeight(dataProviderCount);

  return (headerHeight / (documentHeight - TIMELINE_TAB_BEGINS_AT)) * 100;
};

export const MIN_HEADER_SIZE = '100px';

export const getMinBodySize = (timelineBodyInitialSize: number): string =>
  `${timelineBodyInitialSize}%`;

export const getBodyPanelStyle = (containerHeight: number): CSSProperties => {
  const fudge = 60;
  const panelHeight = containerHeight - fudge;

  return {
    // backgroundColor: 'green',
    // border: '1px solid blue',
    height: `${panelHeight}px`,
  };
};

export const getContainerHeight = (): number => {
  const documentHeight = getDocumentHeight(fallbackDocumentHeight);
  const fudge = 10;
  return documentHeight - TIMELINE_TAB_BEGINS_AT - fudge;
};

export const getFixedHeightFlexGroupStyle = (): CSSProperties => {
  const panelHeight = getContainerHeight();

  return {
    // backgroundColor: 'orange',
    // border: '1px solid red',
    height: `${panelHeight}px`,
    overflow: 'hidden',
  };
};

export const getMaybeFixedWidthStyle = ({
  containerWidth,
  fieldsSidebarWidth,
  showFields,
}: {
  containerWidth: number | undefined;
  fieldsSidebarWidth: number; // px
  showFields: boolean;
}): CSSProperties | undefined => {
  if (containerWidth != null) {
    const width = showFields ? containerWidth - fieldsSidebarWidth : containerWidth;

    return {
      width: `${width}px`,
    };
  } else {
    return undefined;
  }
};
