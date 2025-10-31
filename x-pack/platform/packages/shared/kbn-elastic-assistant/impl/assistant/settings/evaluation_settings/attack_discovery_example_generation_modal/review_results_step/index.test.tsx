/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewResultsStep } from '.';
import type { ReviewResultsStepProps } from '.';
import type { Document } from '../validation';

describe('ReviewResultsStep', () => {
  const mockHandleGeneratedAlertsCsvEdit = jest.fn();
  const mockHandleViewModeChange = jest.fn();

  const existingAlerts: Document[] = [
    { metadata: { dataset: 'test' }, pageContent: 'field1,value1' },
    { metadata: { dataset: 'test' }, pageContent: 'field2,value2' },
  ];

  const validatedAlerts: Document[] = [
    { metadata: { dataset: 'test' }, pageContent: 'field1,value1\nfield3,value3' },
    { metadata: { dataset: 'test' }, pageContent: 'field2,value2\nfield4,value4' },
  ];

  const defaultProps: ReviewResultsStepProps = {
    diffRendered: <span>{'Diff content'}</span>,
    editValidationError: null,
    existingAlerts,
    generatedAlertsCsv: 'field1,value1\nfield3,value3\n\nfield2,value2\nfield4,value4',
    handleGeneratedAlertsCsvEdit: mockHandleGeneratedAlertsCsvEdit,
    handleViewModeChange: mockHandleViewModeChange,
    validatedAlerts,
    viewMode: 'diff',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders alert counts', () => {
    render(<ReviewResultsStep {...defaultProps} />);

    expect(screen.getByText(/original alerts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/generated alerts/i).length).toBeGreaterThan(0);
  });

  it('renders success indicator when counts match', () => {
    render(<ReviewResultsStep {...defaultProps} />);

    expect(screen.getByText(/alert counts match/i)).toBeInTheDocument();
    expect(screen.getByText('✅')).toBeInTheDocument();
  });

  it('renders error indicator when counts do not match', () => {
    const mismatchedAlerts = [validatedAlerts[0]];

    render(<ReviewResultsStep {...defaultProps} validatedAlerts={mismatchedAlerts} />);

    expect(screen.getByText(/alert counts do not match/i)).toBeInTheDocument();
    expect(screen.getByText('❌')).toBeInTheDocument();
  });

  it('renders diff view by default', () => {
    render(<ReviewResultsStep {...defaultProps} />);

    expect(screen.getByText('Diff content')).toBeInTheDocument();
  });

  it('renders edit view when viewMode is edit', () => {
    render(<ReviewResultsStep {...defaultProps} viewMode="edit" />);

    expect(screen.getByDisplayValue(/field1,value1/i)).toBeInTheDocument();
  });

  it('renders validation error when present', () => {
    const errorMessage = 'Invalid CSV format';

    render(<ReviewResultsStep {...defaultProps} editValidationError={errorMessage} />);

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('calls handleViewModeChange when toggling view mode', async () => {
    render(<ReviewResultsStep {...defaultProps} />);

    const editButton = screen.getByRole('button', { name: /edit/i });

    await userEvent.click(editButton);

    expect(mockHandleViewModeChange).toHaveBeenCalled();
    expect(mockHandleViewModeChange.mock.calls[0][0]).toBe('edit');
  });
});
