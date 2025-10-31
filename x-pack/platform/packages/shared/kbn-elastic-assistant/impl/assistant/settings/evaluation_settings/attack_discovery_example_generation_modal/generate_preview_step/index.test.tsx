/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeneratePreviewStep } from '.';
import type { GeneratePreviewStepProps } from '.';

describe('GeneratePreviewStep', () => {
  const mockHandleGeneratePreview = jest.fn();
  const mockHandleModelChange = jest.fn();
  const mockHandlePromptChange = jest.fn();

  const defaultProps: GeneratePreviewStepProps = {
    canGenerate: false,
    generationError: null,
    handleGeneratePreview: mockHandleGeneratePreview,
    handleModelChange: mockHandleModelChange,
    handlePromptChange: mockHandlePromptChange,
    isChatLoading: false,
    isGenerating: false,
    modelOptions: [
      { label: 'Model 1', key: 'model1' },
      { label: 'Model 2', key: 'model2' },
    ],
    promptText: 'Default prompt',
    selectedModel: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the model selector and prompt textarea', () => {
    render(<GeneratePreviewStep {...defaultProps} />);

    expect(
      screen.getByText(/select a model and optionally customize the prompt/i)
    ).toBeInTheDocument();
  });

  it('renders generate button as disabled when canGenerate is false', () => {
    render(<GeneratePreviewStep {...defaultProps} canGenerate={false} />);

    expect(screen.getByRole('button', { name: /generate preview/i })).toBeDisabled();
  });

  it('renders generate button as enabled when canGenerate is true', () => {
    render(<GeneratePreviewStep {...defaultProps} canGenerate={true} />);

    expect(screen.getByRole('button', { name: /generate preview/i })).toBeEnabled();
  });

  it('renders loading state when generating', () => {
    render(<GeneratePreviewStep {...defaultProps} canGenerate={true} isGenerating={true} />);

    expect(screen.getByRole('button', { name: /generating/i })).toBeInTheDocument();
  });

  it('renders error callout when generationError is present', () => {
    const errorMessage = 'Generation failed';

    render(<GeneratePreviewStep {...defaultProps} generationError={errorMessage} />);

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('calls handleGeneratePreview when generate button is clicked', async () => {
    render(<GeneratePreviewStep {...defaultProps} canGenerate={true} />);

    const generateButton = screen.getByRole('button', { name: /generate preview/i });

    await userEvent.click(generateButton);

    expect(mockHandleGeneratePreview).toHaveBeenCalledTimes(1);
  });
});
