/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SelectExampleStep } from '.';
import type { SelectExampleStepProps } from '.';

describe('SelectExampleStep', () => {
  const defaultProps: SelectExampleStepProps = {
    datasetOptions: [
      { label: 'Dataset 1', key: 'dataset1' },
      { label: 'Dataset 2', key: 'dataset2' },
    ],
    exampleOptions: [],
    handleDatasetChange: jest.fn(),
    handleExampleChange: jest.fn(),
    isExamplesError: false,
    isLoadingExamples: false,
    selectedDataset: [],
    selectedExample: [],
  };

  it('renders the dataset selector', () => {
    render(<SelectExampleStep {...defaultProps} />);

    expect(screen.getByText(/choose a langsmith dataset/i)).toBeInTheDocument();
  });

  it('renders loading spinner when examples are loading', () => {
    render(
      <SelectExampleStep
        {...defaultProps}
        isLoadingExamples={true}
        selectedDataset={[{ label: 'Dataset 1', key: 'dataset1' }]}
      />
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders error callout when there is an examples error', () => {
    render(
      <SelectExampleStep
        {...defaultProps}
        isExamplesError={true}
        selectedDataset={[{ label: 'Dataset 1', key: 'dataset1' }]}
      />
    );

    expect(screen.getByText(/error loading examples from dataset/i)).toBeInTheDocument();
  });

  it('renders warning when no examples are found', () => {
    render(
      <SelectExampleStep
        {...defaultProps}
        exampleOptions={[]}
        selectedDataset={[{ label: 'Dataset 1', key: 'dataset1' }]}
      />
    );

    expect(screen.getByText(/no examples found in the selected dataset/i)).toBeInTheDocument();
  });

  it('renders example selector when examples are available', () => {
    const exampleOptions = [
      { label: 'Example 1', key: 'example1' },
      { label: 'Example 2', key: 'example2' },
    ];

    render(
      <SelectExampleStep
        {...defaultProps}
        exampleOptions={exampleOptions}
        selectedDataset={[{ label: 'Dataset 1', key: 'dataset1' }]}
      />
    );

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });
});
