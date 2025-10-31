/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButtonGroup,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';

import type { Document } from '../validation';
import * as i18n from '../../translations';

export interface ReviewResultsStepProps {
  diffRendered: React.ReactNode;
  editValidationError: string | null;
  existingAlerts: Document[];
  generatedAlertsCsv: string;
  handleGeneratedAlertsCsvEdit: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleViewModeChange: (id: string) => void;
  validatedAlerts: Document[] | null;
  viewMode: 'diff' | 'edit';
}

export const ReviewResultsStep: React.FC<ReviewResultsStepProps> = React.memo(
  ({
    diffRendered,
    editValidationError,
    existingAlerts,
    generatedAlertsCsv,
    handleGeneratedAlertsCsvEdit,
    handleViewModeChange,
    validatedAlerts,
    viewMode,
  }) => {
    const originalCount = existingAlerts.length;
    const generatedCount = validatedAlerts?.length ?? 0;
    const countsMatch = originalCount === generatedCount;

    return (
      <>
        <EuiText size="s">
          <p>{i18n.REVIEW_RESULTS_DESCRIPTION}</p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFlexGroup alignItems="center" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiText>
              <span aria-label={countsMatch ? 'success' : 'error'} role="img">
                {countsMatch ? '✅' : '❌'}
              </span>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>
                {i18n.REVIEW_RESULTS_ORIGINAL_COUNT_LABEL}
                {':'}
              </strong>{' '}
              {originalCount}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>
                {i18n.REVIEW_RESULTS_GENERATED_COUNT_LABEL}
                {':'}
              </strong>{' '}
              {generatedCount}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText color={countsMatch ? 'success' : 'danger'} size="s">
              <strong>
                {countsMatch
                  ? i18n.REVIEW_RESULTS_COUNTS_MATCH
                  : i18n.REVIEW_RESULTS_COUNTS_MISMATCH}
              </strong>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <EuiFormRow fullWidth label={i18n.REVIEW_RESULTS_TOGGLE_LABEL}>
          <EuiButtonGroup
            buttonSize="m"
            idSelected={viewMode}
            isFullWidth={false}
            legend={i18n.REVIEW_RESULTS_TOGGLE_LABEL}
            onChange={handleViewModeChange}
            options={[
              { id: 'diff', label: i18n.REVIEW_RESULTS_VIEW_MODE_DIFF },
              { id: 'edit', label: i18n.REVIEW_RESULTS_VIEW_MODE_EDIT },
            ]}
          />
        </EuiFormRow>
        <EuiSpacer size="m" />
        <EuiFormRow fullWidth label={i18n.REVIEW_RESULTS_PREVIEW_LABEL}>
          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            {viewMode === 'diff' ? (
              <EuiText>
                <p>{diffRendered}</p>
              </EuiText>
            ) : (
              <EuiTextArea
                aria-label={i18n.REVIEW_RESULTS_PREVIEW_LABEL}
                fullWidth
                isInvalid={editValidationError !== null}
                onChange={handleGeneratedAlertsCsvEdit}
                rows={15}
                value={generatedAlertsCsv}
              />
            )}
          </div>
        </EuiFormRow>
        {editValidationError && (
          <>
            <EuiSpacer size="s" />
            <EuiCallOut
              announceOnMount
              color="danger"
              iconType="error"
              title={i18n.GENERATE_PREVIEW_VALIDATION_ERROR}
            >
              <p>{editValidationError}</p>
            </EuiCallOut>
          </>
        )}
      </>
    );
  }
);

ReviewResultsStep.displayName = 'ReviewResultsStep';
