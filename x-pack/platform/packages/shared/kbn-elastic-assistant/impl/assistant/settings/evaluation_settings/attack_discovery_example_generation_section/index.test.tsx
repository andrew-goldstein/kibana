/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttackDiscoveryExampleGenerationSection } from '.';
import { TestProviders } from '../../../../mock/test_providers/test_providers';

describe('AttackDiscoveryExampleGenerationSection', () => {
  const mockDatasetOptions = [{ label: 'dataset1' }, { label: 'dataset2' }];

  const mockModelOptions = [
    { key: 'model1', label: 'Model 1' },
    { key: 'model2', label: 'Model 2' },
  ];

  it('renders the section with title and description', () => {
    render(
      <TestProviders>
        <AttackDiscoveryExampleGenerationSection
          datasetOptions={mockDatasetOptions}
          modelOptions={mockModelOptions}
        />
      </TestProviders>
    );

    expect(
      screen.getByText('Generate example data for new anonymization fields')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Generate new dataset examples with additional anonymization fields/i)
    ).toBeInTheDocument();
  });

  it('renders the generate example button', () => {
    render(
      <TestProviders>
        <AttackDiscoveryExampleGenerationSection
          datasetOptions={mockDatasetOptions}
          modelOptions={mockModelOptions}
        />
      </TestProviders>
    );

    expect(screen.getByRole('button', { name: /generate example/i })).toBeInTheDocument();
  });

  it('opens the modal when the generate button is clicked', async () => {
    render(
      <TestProviders>
        <AttackDiscoveryExampleGenerationSection
          datasetOptions={mockDatasetOptions}
          modelOptions={mockModelOptions}
        />
      </TestProviders>
    );

    const generateButton = screen.getByRole('button', { name: /generate example/i });
    await userEvent.click(generateButton);

    // Modal title should be visible after clicking the button
    expect(screen.getByText('Generate Attack Discovery Example')).toBeInTheDocument();
  });

  it('closes the modal when the close button is clicked', async () => {
    render(
      <TestProviders>
        <AttackDiscoveryExampleGenerationSection
          datasetOptions={mockDatasetOptions}
          modelOptions={mockModelOptions}
        />
      </TestProviders>
    );

    // Open the modal
    const generateButton = screen.getByRole('button', { name: /generate example/i });
    await userEvent.click(generateButton);

    // Modal should be open
    expect(screen.getByText('Generate Attack Discovery Example')).toBeInTheDocument();

    // Close the modal using the X button (aria-label)
    const closeButton = screen.getByRole('button', { name: 'Closes this modal window' });
    await userEvent.click(closeButton);

    // Modal should be closed
    expect(screen.queryByText('Generate Attack Discovery Example')).not.toBeInTheDocument();
  });
});
