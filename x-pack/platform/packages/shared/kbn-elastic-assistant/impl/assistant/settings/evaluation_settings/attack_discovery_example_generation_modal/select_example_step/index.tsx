/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiCallOut,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import * as i18n from '../../translations';

const SINGLE_SELECTION = { asPlainText: true } as const;

export interface SelectExampleStepProps {
  datasetOptions: Array<EuiComboBoxOptionOption<string>>;
  exampleOptions: Array<EuiComboBoxOptionOption<string>>;
  handleDatasetChange: (options: Array<EuiComboBoxOptionOption<string>>) => void;
  handleExampleChange: (options: Array<EuiComboBoxOptionOption<string>>) => void;
  isExamplesError: boolean;
  isLoadingExamples: boolean;
  selectedDataset: Array<EuiComboBoxOptionOption<string>>;
  selectedExample: Array<EuiComboBoxOptionOption<string>>;
}

export const SelectExampleStep: React.FC<SelectExampleStepProps> = React.memo(
  ({
    datasetOptions,
    exampleOptions,
    handleDatasetChange,
    handleExampleChange,
    isExamplesError,
    isLoadingExamples,
    selectedDataset,
    selectedExample,
  }) => (
    <>
      <EuiText size="s">
        <p>{i18n.SELECT_EXAMPLE_DESCRIPTION}</p>
      </EuiText>
      <EuiSpacer size="m" />
      <EuiFormRow fullWidth label={i18n.SELECT_EXAMPLE_DATASET_LABEL}>
        <EuiComboBox
          aria-label={i18n.SELECT_EXAMPLE_DATASET_LABEL}
          fullWidth
          onChange={handleDatasetChange}
          options={datasetOptions}
          placeholder={i18n.SELECT_EXAMPLE_DATASET_PLACEHOLDER}
          selectedOptions={selectedDataset}
          singleSelection={SINGLE_SELECTION}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      {selectedDataset.length > 0 && (
        <>
          {isLoadingExamples ? (
            <EuiFlexGroup justifyContent="center">
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="l" />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : isExamplesError ? (
            <EuiCallOut
              announceOnMount
              color="danger"
              iconType="error"
              title={i18n.SELECT_EXAMPLE_ERROR_LOADING_EXAMPLES}
            />
          ) : exampleOptions.length === 0 ? (
            <EuiCallOut
              announceOnMount
              color="warning"
              iconType="alert"
              title={i18n.SELECT_EXAMPLE_NO_EXAMPLES_FOUND}
            />
          ) : (
            <EuiFormRow fullWidth label={i18n.SELECT_EXAMPLE_LABEL}>
              <EuiComboBox
                aria-label={i18n.SELECT_EXAMPLE_LABEL}
                fullWidth
                onChange={handleExampleChange}
                options={exampleOptions}
                placeholder={i18n.SELECT_EXAMPLE_PLACEHOLDER}
                selectedOptions={selectedExample}
                singleSelection={SINGLE_SELECTION}
              />
            </EuiFormRow>
          )}
        </>
      )}
    </>
  )
);

SelectExampleStep.displayName = 'SelectExampleStep';
