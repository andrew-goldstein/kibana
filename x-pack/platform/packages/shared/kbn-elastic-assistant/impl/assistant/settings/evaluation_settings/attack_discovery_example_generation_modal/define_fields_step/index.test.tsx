/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DefineFieldsStep } from '.';
import type { DefineFieldsStepProps } from '.';

describe('DefineFieldsStep', () => {
  const mockHandleNewFieldsChange = jest.fn();
  const mockRef = { current: null };

  const defaultProps: DefineFieldsStepProps = {
    handleNewFieldsChange: mockHandleNewFieldsChange,
    newFieldsText: '',
    newFieldsTextareaRef: mockRef,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the fields textarea', () => {
    render(<DefineFieldsStep {...defaultProps} />);

    expect(
      screen.getByText(/enter additional field names to include in the example alerts/i)
    ).toBeInTheDocument();
  });

  it('renders with initial text value', () => {
    const newFieldsText = 'container.id\ncontainer.name';

    render(<DefineFieldsStep {...defaultProps} newFieldsText={newFieldsText} />);

    const textarea = screen.getByRole('textbox');

    expect(textarea).toHaveValue(newFieldsText);
  });

  it('calls handleNewFieldsChange when text is entered', async () => {
    render(<DefineFieldsStep {...defaultProps} />);

    const textarea = screen.getByRole('textbox');

    await userEvent.type(textarea, 'field.name');

    expect(mockHandleNewFieldsChange).toHaveBeenCalled();
  });

  it('renders the placeholder text', () => {
    render(<DefineFieldsStep {...defaultProps} />);

    expect(screen.getByPlaceholderText(/container.id/i)).toBeInTheDocument();
  });
});
