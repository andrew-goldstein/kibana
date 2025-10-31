/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFormRow, EuiSpacer, EuiText, EuiTextArea } from '@elastic/eui';

import * as i18n from '../../translations';

export interface DefineFieldsStepProps {
  handleNewFieldsChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  newFieldsText: string;
  newFieldsTextareaRef: React.RefObject<HTMLTextAreaElement>;
}

export const DefineFieldsStep: React.FC<DefineFieldsStepProps> = React.memo(
  ({ handleNewFieldsChange, newFieldsText, newFieldsTextareaRef }) => (
    <>
      <EuiText size="s">
        <p>{i18n.DEFINE_FIELDS_DESCRIPTION}</p>
      </EuiText>
      <EuiSpacer size="m" />
      <EuiFormRow fullWidth label={i18n.DEFINE_FIELDS_LABEL}>
        <EuiTextArea
          aria-label={i18n.DEFINE_FIELDS_LABEL}
          fullWidth
          inputRef={newFieldsTextareaRef}
          onChange={handleNewFieldsChange}
          placeholder={i18n.DEFINE_FIELDS_PLACEHOLDER}
          rows={6}
          value={newFieldsText}
        />
      </EuiFormRow>
    </>
  )
);

DefineFieldsStep.displayName = 'DefineFieldsStep';
