/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppendToDatasetStep } from '.';
import type { AppendToDatasetStepProps } from '.';

describe('AppendToDatasetStep', () => {
  const mockHandleAppendToDataset = jest.fn();
  const mockHandleExampleNameChange = jest.fn();
  const mockHandleTargetDatasetChange = jest.fn();

  const defaultProps: AppendToDatasetStepProps = {
    canAppend: false,
    datasetOptions: [
      { label: 'Dataset 1', key: 'dataset1' },
      { label: 'Dataset 2', key: 'dataset2' },
    ],
    exampleName: '',
    handleAppendToDataset: mockHandleAppendToDataset,
    handleExampleNameChange: mockHandleExampleNameChange,
    handleTargetDatasetChange: mockHandleTargetDatasetChange,
    isAppending: false,
    targetDataset: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dataset selector and example name input', () => {
    render(<AppendToDatasetStep {...defaultProps} />);

    expect(screen.getByText(/select a langsmith dataset to append/i)).toBeInTheDocument();
  });

  it('renders add button as disabled when canAppend is false', () => {
    render(<AppendToDatasetStep {...defaultProps} canAppend={false} />);

    expect(screen.getByRole('button', { name: /add new example/i })).toBeDisabled();
  });

  it('renders add button as enabled when canAppend is true', () => {
    render(<AppendToDatasetStep {...defaultProps} canAppend={true} />);

    expect(screen.getByRole('button', { name: /add new example/i })).toBeEnabled();
  });

  it('renders loading state when appending', () => {
    render(<AppendToDatasetStep {...defaultProps} canAppend={true} isAppending={true} />);

    expect(screen.getByRole('button', { name: /appending/i })).toBeInTheDocument();
  });

  it('renders example name value', () => {
    const exampleName = 'Test Example';

    render(<AppendToDatasetStep {...defaultProps} exampleName={exampleName} />);

    expect(screen.getByDisplayValue(exampleName)).toBeInTheDocument();
  });

  it('calls handleAppendToDataset when add button is clicked', async () => {
    render(<AppendToDatasetStep {...defaultProps} canAppend={true} />);

    const addButton = screen.getByRole('button', { name: /add new example/i });

    await userEvent.click(addButton);

    expect(mockHandleAppendToDataset).toHaveBeenCalledTimes(1);
  });

  it('calls handleExampleNameChange when typing in example name field', async () => {
    render(<AppendToDatasetStep {...defaultProps} />);

    const nameInput = screen.getByRole('textbox', { name: /new example name/i });

    await userEvent.type(nameInput, 'New Name');

    expect(mockHandleExampleNameChange).toHaveBeenCalled();
  });
});
