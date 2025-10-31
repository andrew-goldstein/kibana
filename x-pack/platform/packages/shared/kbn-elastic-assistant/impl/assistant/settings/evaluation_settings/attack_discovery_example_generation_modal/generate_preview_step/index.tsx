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
  EuiCallOut,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';

import * as i18n from '../../translations';

const SINGLE_SELECTION = { asPlainText: true } as const;

export interface GeneratePreviewStepProps {
  canGenerate: boolean;
  generationError: string | null;
  handleGeneratePreview: () => void;
  handleModelChange: (options: Array<EuiComboBoxOptionOption<string>>) => void;
  handlePromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isChatLoading: boolean;
  isGenerating: boolean;
  modelOptions: Array<EuiComboBoxOptionOption<string>>;
  promptText: string;
  selectedModel: Array<EuiComboBoxOptionOption<string>>;
}

export const GeneratePreviewStep: React.FC<GeneratePreviewStepProps> = React.memo(
  ({
    canGenerate,
    generationError,
    handleGeneratePreview,
    handleModelChange,
    handlePromptChange,
    isChatLoading,
    isGenerating,
    modelOptions,
    promptText,
    selectedModel,
  }) => (
    <>
      <EuiText size="s">
        <p>{i18n.GENERATE_PREVIEW_DESCRIPTION}</p>
      </EuiText>
      <EuiSpacer size="m" />
      <EuiFormRow fullWidth label={i18n.GENERATE_PREVIEW_MODEL_LABEL}>
        <EuiComboBox
          aria-label={i18n.GENERATE_PREVIEW_MODEL_LABEL}
          fullWidth
          onChange={handleModelChange}
          options={modelOptions}
          placeholder={i18n.GENERATE_PREVIEW_MODEL_PLACEHOLDER}
          selectedOptions={selectedModel}
          singleSelection={SINGLE_SELECTION}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFormRow fullWidth label={i18n.GENERATE_PREVIEW_PROMPT_LABEL}>
        <EuiTextArea
          aria-label={i18n.GENERATE_PREVIEW_PROMPT_LABEL}
          fullWidth
          onChange={handlePromptChange}
          rows={8}
          value={promptText}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFlexGroup justifyContent="flexStart">
        <EuiFlexItem grow={false}>
          <EuiButton
            disabled={!canGenerate}
            fill
            isLoading={isGenerating || isChatLoading}
            onClick={handleGeneratePreview}
          >
            {isGenerating || isChatLoading
              ? i18n.GENERATE_PREVIEW_GENERATING
              : i18n.GENERATE_PREVIEW_BUTTON}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      {generationError && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut
            announceOnMount
            color="danger"
            iconType="error"
            title={i18n.GENERATE_PREVIEW_ERROR}
          >
            <p>{generationError}</p>
          </EuiCallOut>
        </>
      )}
    </>
  )
);

GeneratePreviewStep.displayName = 'GeneratePreviewStep';
