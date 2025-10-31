/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiButton,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import * as i18n from '../../translations';

const SINGLE_SELECTION = { asPlainText: true } as const;

export interface AppendToDatasetStepProps {
  canAppend: boolean;
  datasetOptions: Array<EuiComboBoxOptionOption<string>>;
  exampleName: string;
  handleAppendToDataset: () => void;
  handleExampleNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleTargetDatasetChange: (options: Array<EuiComboBoxOptionOption<string>>) => void;
  isAppending: boolean;
  targetDataset: Array<EuiComboBoxOptionOption<string>>;
}

export const AppendToDatasetStep: React.FC<AppendToDatasetStepProps> = React.memo(
  ({
    canAppend,
    datasetOptions,
    exampleName,
    handleAppendToDataset,
    handleExampleNameChange,
    handleTargetDatasetChange,
    isAppending,
    targetDataset,
  }) => (
    <>
      <EuiText size="s">
        <p>{i18n.APPEND_TO_DATASET_DESCRIPTION}</p>
      </EuiText>
      <EuiSpacer size="m" />
      <EuiFormRow fullWidth label={i18n.APPEND_TO_DATASET_DATASET_LABEL}>
        <EuiComboBox
          aria-label={i18n.APPEND_TO_DATASET_DATASET_LABEL}
          fullWidth
          onChange={handleTargetDatasetChange}
          options={datasetOptions}
          placeholder={i18n.APPEND_TO_DATASET_DATASET_PLACEHOLDER}
          selectedOptions={targetDataset}
          singleSelection={SINGLE_SELECTION}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFormRow fullWidth label={i18n.APPEND_TO_DATASET_EXAMPLE_NAME_LABEL}>
        <EuiFieldText
          aria-label={i18n.APPEND_TO_DATASET_EXAMPLE_NAME_LABEL}
          fullWidth
          onChange={handleExampleNameChange}
          placeholder={i18n.APPEND_TO_DATASET_EXAMPLE_NAME_PLACEHOLDER}
          value={exampleName}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFlexGroup justifyContent="flexStart">
        <EuiFlexItem grow={false}>
          <EuiButton
            disabled={!canAppend}
            fill
            isLoading={isAppending}
            onClick={handleAppendToDataset}
          >
            {isAppending ? i18n.APPEND_TO_DATASET_APPENDING : i18n.APPEND_TO_DATASET_BUTTON}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  )
);

AppendToDatasetStep.displayName = 'AppendToDatasetStep';
