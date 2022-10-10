/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
// eslint-disable-next-line @kbn/eslint/module_migration
import styled, { css } from 'styled-components';

import type { FieldBrowserProps } from './types';
import { Search } from './components/search';
import { RESET_FIELDS_CLASS_NAME } from './helpers';
import * as i18n from './translations';
import { CategoriesSelector } from './components/categories_selector';
import { CategoriesBadges } from './components/categories_badges';
import { FieldTable } from './components/field_table';
import { FieldBrowserModalProps } from './field_browser_modal';

export const DEFAULT_WIDTH = 300; // px

const FieldBrowserSidebarContainer = styled.div<{ $width: number }>`
  ${({ theme, $width }) => css`
    height: 100%;
    padding: ${theme.eui.euiSizeS} ${theme.eui.euiSizeS} 0 ${theme.eui.euiSizeS};
    width: ${$width}px;
  `}
`;

const FullHeightFlexGroup = styled(EuiFlexGroup)`
  height: 100%;
`;

/**
 * This component has no internal state, but it uses lifecycle methods to
 * set focus to the search input, scroll to the selected category, etc
 */
const FieldBrowserSidebarComponent: React.FC<FieldBrowserProps & FieldBrowserModalProps> = ({
  appliedFilterInput,
  columnIds,
  filteredBrowserFields,
  filterSelectedEnabled,
  isSearching,
  onFilterSelectedChange,
  onToggleColumn,
  onResetColumns,
  setSelectedCategoryIds,
  onSearchInputChange,
  onHide,
  options,
  restoreFocusTo,
  searchInput,
  selectedCategoryIds,
  width = DEFAULT_WIDTH,
}) => {
  const closeAndRestoreFocus = useCallback(() => {
    onHide();
    setTimeout(() => {
      // restore focus on the next tick after we have escaped the EuiFocusTrap
      restoreFocusTo.current?.focus();
    }, 0);
  }, [onHide, restoreFocusTo]);

  const resetColumns = useCallback(() => {
    onResetColumns();
    closeAndRestoreFocus();
  }, [closeAndRestoreFocus, onResetColumns]);

  /** Invoked when the user types in the input to filter the field browser */
  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onSearchInputChange(event.target.value);
    },
    [onSearchInputChange]
  );

  const [CreateFieldButton, getFieldTableColumns] = [
    options?.createFieldButton,
    options?.getFieldTableColumns,
  ];

  const Body = useMemo(
    () => (
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            className={RESET_FIELDS_CLASS_NAME}
            data-test-subj="reset-fields"
            onClick={resetColumns}
          >
            {i18n.RESET_FIELDS}
          </EuiButtonEmpty>

          <EuiSpacer size="xs" />
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <Search
            data-test-subj="header"
            isSearching={isSearching}
            onSearchInputChange={onInputChange}
            searchInput={searchInput}
          />

          <EuiSpacer size="xs" />
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <CategoriesSelector
            filteredBrowserFields={filteredBrowserFields}
            setSelectedCategoryIds={setSelectedCategoryIds}
            selectedCategoryIds={selectedCategoryIds}
          />
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <CategoriesBadges
            selectedCategoryIds={selectedCategoryIds}
            setSelectedCategoryIds={setSelectedCategoryIds}
          />
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <FieldTable
            columnIds={columnIds}
            filteredBrowserFields={filteredBrowserFields}
            filterSelectedEnabled={filterSelectedEnabled}
            searchInput={appliedFilterInput}
            selectedCategoryIds={selectedCategoryIds}
            onFilterSelectedChange={onFilterSelectedChange}
            onToggleColumn={onToggleColumn}
            getFieldTableColumns={getFieldTableColumns}
            onHide={onHide}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [
      appliedFilterInput,
      columnIds,
      filterSelectedEnabled,
      filteredBrowserFields,
      getFieldTableColumns,
      isSearching,
      onFilterSelectedChange,
      onHide,
      onInputChange,
      onToggleColumn,
      resetColumns,
      searchInput,
      selectedCategoryIds,
      setSelectedCategoryIds,
    ]
  );

  return (
    <FieldBrowserSidebarContainer
      data-test-subj="fieldsBrowserSidebarContainer"
      className="eui-yScroll"
      $width={width}
    >
      <FullHeightFlexGroup direction="column" gutterSize="none" justifyContent="spaceBetween">
        <EuiFlexItem grow={true}>{Body}</EuiFlexItem>

        <EuiFlexItem grow={false}>
          {CreateFieldButton && <CreateFieldButton onHide={onHide} />}
        </EuiFlexItem>
      </FullHeightFlexGroup>
    </FieldBrowserSidebarContainer>
  );
};

export const FieldBrowserSidebar = React.memo(FieldBrowserSidebarComponent);
