/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  useEuiTextDiff,
  useGeneratedHtmlId,
} from '@elastic/eui';

import type { GetDatasetExamplesResponse } from '@kbn/elastic-assistant-common';

import { useAppendDatasetExample } from '../../../api/evaluate/use_append_dataset_example';
import { useChatComplete } from '../../../api/chat_complete/use_chat_complete';
import { useDatasetExamples } from '../../../api/evaluate/use_dataset_examples';
import { useAssistantContext } from '../../../../assistant_context';
import * as i18n from '../translations';
import { csvToDocuments, documentsToCsv, validateDocuments, type Document } from './validation';
import { SelectExampleStep } from './select_example_step';
import { DefineFieldsStep } from './define_fields_step';
import { GeneratePreviewStep } from './generate_preview_step';
import { ReviewResultsStep } from './review_results_step';
import { AppendToDatasetStep } from './append_to_dataset_step';

type Step =
  | 'selectExample'
  | 'defineFields'
  | 'generatePreview'
  | 'reviewResults'
  | 'appendToDataset';

interface AttackDiscoveryExampleGenerationModalProps {
  datasetOptions: Array<EuiComboBoxOptionOption<string>>;
  modelOptions: Array<EuiComboBoxOptionOption<string>>;
  onClose: () => void;
}

interface ExampleData {
  created_at?: string;
  id: string;
  inputs?: Record<string, unknown>;
  name?: string;
  outputs?: Record<string, unknown>;
}

const STEP_ORDER: Step[] = [
  'selectExample',
  'defineFields',
  'generatePreview',
  'reviewResults',
  'appendToDataset',
];

export const AttackDiscoveryExampleGenerationModal: React.FC<AttackDiscoveryExampleGenerationModalProps> =
  React.memo(({ datasetOptions, modelOptions, onClose }) => {
    const { http, toasts, traceOptions } = useAssistantContext();
    const modalTitleId = useGeneratedHtmlId();

    // Refs for button focusing
    const nextButtonRef = useRef<HTMLButtonElement>(null);

    // Refs for input focusing
    const newFieldsTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Step management
    const [currentStep, setCurrentStep] = useState<Step>('selectExample');

    // SelectExample: Dataset and Example selection
    const [selectedDataset, setSelectedDataset] = useState<Array<EuiComboBoxOptionOption<string>>>(
      []
    );
    const [selectedExample, setSelectedExample] = useState<Array<EuiComboBoxOptionOption<string>>>(
      []
    );
    const [exampleData, setExampleData] = useState<ExampleData | null>(null);
    const [existingAlerts, setExistingAlerts] = useState<Document[]>([]);

    // DefineFields: New fields
    const [newFieldsText, setNewFieldsText] = useState<string>('');

    // GeneratePreview: Model and prompt
    const [selectedModel, setSelectedModel] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
    const [promptText, setPromptText] = useState<string>(i18n.GENERATE_PREVIEW_DEFAULT_PROMPT);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [generationError, setGenerationError] = useState<string | null>(null);

    // ReviewResults: Review with diff/edit
    const [viewMode, setViewMode] = useState<'diff' | 'edit'>('diff');
    const [generatedAlertsCsv, setGeneratedAlertsCsv] = useState<string>('');
    const [validatedAlerts, setValidatedAlerts] = useState<Document[] | null>(null);
    const [editValidationError, setEditValidationError] = useState<string | null>(null);

    // AppendToDataset: Append to dataset
    const [targetDataset, setTargetDataset] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
    const [exampleName, setExampleName] = useState<string>('');
    const [isAppending, setIsAppending] = useState<boolean>(false);

    const connectorId = selectedModel[0]?.key ?? '';
    const { isLoading: isChatLoading, sendMessage } = useChatComplete({ connectorId });
    const { mutateAsync: appendExample } = useAppendDatasetExample({
      http,
      langSmithApiKey: traceOptions.langSmithApiKey,
      toasts,
    });

    // Fetch examples for selected dataset
    const datasetName = selectedDataset[0]?.label;
    const {
      data: datasetExamplesData,
      isError: isExamplesError,
      isLoading: isLoadingExamples,
    } = useDatasetExamples({
      datasetName: datasetName ?? '',
      enabled: !!datasetName,
      http,
      langSmithApiKey: traceOptions.langSmithApiKey,
      toasts,
    });

    const availableExamples = useMemo(() => {
      return (datasetExamplesData as GetDatasetExamplesResponse | undefined)?.examples ?? [];
    }, [datasetExamplesData]);

    const exampleOptions = useMemo(() => {
      return availableExamples.map((ex) => ({
        key: ex.id,
        label: ex.name || ex.id,
      }));
    }, [availableExamples]);

    // Parse new fields from text
    const newFields = useMemo(() => {
      return newFieldsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }, [newFieldsText]);

    // Navigation handlers
    const advanceToNextStep = useCallback(() => {
      const currentIndex = STEP_ORDER.indexOf(currentStep);
      if (currentIndex < STEP_ORDER.length - 1) {
        setCurrentStep(STEP_ORDER[currentIndex + 1]);
      }
    }, [currentStep]);

    const backToPreviousStep = useCallback(() => {
      const currentIndex = STEP_ORDER.indexOf(currentStep);
      if (currentIndex > 0) {
        setCurrentStep(STEP_ORDER[currentIndex - 1]);
      }
    }, [currentStep]);

    // Step handlers
    const handleDatasetChange = useCallback((options: Array<EuiComboBoxOptionOption<string>>) => {
      setSelectedDataset(options);
      // Reset downstream selections
      setSelectedExample([]);
      setExampleData(null);
      setExistingAlerts([]);
      // Focus Next button after selection
      if (options.length > 0) {
        setTimeout(() => nextButtonRef.current?.focus(), 0);
      }
    }, []);

    const handleExampleChange = useCallback(
      (options: Array<EuiComboBoxOptionOption<string>>) => {
        setSelectedExample(options);
        if (options[0]) {
          const example = availableExamples.find((ex) => ex.id === options[0].key);
          if (example) {
            setExampleData(example);
            // Extract existing alerts from outputs
            const outputs = example.outputs || {};
            const alerts =
              (outputs.anonymizedAlerts as Document[]) ||
              (outputs.anonymizedDocuments as Document[]) ||
              [];
            setExistingAlerts(alerts);
            // Focus Next button after selection
            setTimeout(() => nextButtonRef.current?.focus(), 0);
          }
        } else {
          setExampleData(null);
          setExistingAlerts([]);
        }
      },
      [availableExamples]
    );

    const handleNewFieldsChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNewFieldsText(e.target.value);
    }, []);

    const handleModelChange = useCallback((options: Array<EuiComboBoxOptionOption<string>>) => {
      setSelectedModel(options);
    }, []);

    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPromptText(e.target.value);
    }, []);

    const handleGeneratePreview = useCallback(async () => {
      if (!connectorId) {
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        // Convert existing alerts to CSV format (pageContent separated by double newlines)
        const existingAlertsCsv = documentsToCsv(existingAlerts);
        const alertCount = existingAlerts.length;

        // Construct the full prompt
        const fullPrompt = `${promptText}

New field names to add:
${newFields.join('\n')}

Number of alerts: ${alertCount}

Existing alerts to augment:
\`\`\`csv
${existingAlertsCsv}
\`\`\`

Remember: Return the updated alerts in the same CSV format, with each alert's CSV content separated by a blank line (double newline). You must return exactly ${alertCount} alerts.`;

        const response = await sendMessage({
          message: fullPrompt,
          replacements: {},
        });

        // Get the response text (should be in CSV format)
        const responseText = response.response || '';

        // Clean up any markdown code blocks if present
        const cleanedText = responseText
          .replace(/```(?:csv|text)?\s*([\s\S]*?)\s*```/g, '$1')
          .trim();

        // Store the CSV response for display
        setGeneratedAlertsCsv(cleanedText);

        // Convert CSV back to Documents for validation
        const parsedDocuments = csvToDocuments(cleanedText);
        const validation = validateDocuments(parsedDocuments);

        if (!validation.valid) {
          setGenerationError(
            `${i18n.GENERATE_PREVIEW_VALIDATION_ERROR}: ${validation.errors?.join(', ')}`
          );
          setValidatedAlerts(null);
          return;
        }

        // Store validated documents
        setValidatedAlerts(validation.data || []);

        // Initialize AppendToDataset example name based on example name
        const shortId = exampleData?.id ? `#${exampleData.id.substring(0, 4)}` : 'Example';
        const baseExampleName = exampleData?.name || shortId;
        setExampleName(`${baseExampleName} + ${newFields.join(' + ')}`);

        advanceToNextStep();
      } catch (error) {
        setGenerationError(
          `${i18n.GENERATE_PREVIEW_ERROR}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      } finally {
        setIsGenerating(false);
      }
    }, [
      advanceToNextStep,
      connectorId,
      exampleData,
      existingAlerts,
      newFields,
      promptText,
      sendMessage,
    ]);

    const handleViewModeChange = useCallback((id: string) => {
      setViewMode(id as 'diff' | 'edit');
    }, []);

    const handleGeneratedAlertsCsvEdit = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newCsv = e.target.value;
        setGeneratedAlertsCsv(newCsv);
        setEditValidationError(null);

        // Re-validate on edit
        try {
          const documents = csvToDocuments(newCsv);
          const validation = validateDocuments(documents);

          if (!validation.valid) {
            setEditValidationError(validation.errors?.join(', ') || 'Validation failed');
            setValidatedAlerts(null);
          } else {
            setValidatedAlerts(validation.data || []);
          }
        } catch (error) {
          setEditValidationError(
            `Invalid CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          setValidatedAlerts(null);
        }
      },
      []
    );

    const handleTargetDatasetChange = useCallback(
      (options: Array<EuiComboBoxOptionOption<string>>) => {
        setTargetDataset(options);
      },
      []
    );

    const handleExampleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setExampleName(e.target.value);
    }, []);

    const handleAppendToDataset = useCallback(async () => {
      if (
        !validatedAlerts ||
        !exampleData ||
        !targetDataset[0]?.label ||
        !selectedDataset[0]?.label
      ) {
        return;
      }

      setIsAppending(true);

      try {
        await appendExample({
          datasetName: targetDataset[0].label,
          exampleName,
          sourceDatasetName: selectedDataset[0].label,
          sourceExampleId: exampleData.id,
          updatedAlerts: validatedAlerts,
        });

        toasts?.addSuccess({
          text: i18n.APPEND_TO_DATASET_SUCCESS_MESSAGE,
          title: i18n.APPEND_TO_DATASET_SUCCESS_TITLE,
        });

        onClose();
      } catch (error) {
        toasts?.addDanger({
          text: error instanceof Error ? error.message : 'Unknown error',
          title: i18n.APPEND_TO_DATASET_ERROR_TITLE,
        });
      } finally {
        setIsAppending(false);
      }
    }, [
      appendExample,
      exampleData,
      exampleName,
      onClose,
      selectedDataset,
      targetDataset,
      toasts,
      validatedAlerts,
    ]);

    // Step validation
    const canProceedToDefineFields = selectedExample.length > 0 && exampleData !== null;
    const canProceedToGeneratePreview = newFields.length > 0;
    const canGenerate = selectedModel.length > 0 && promptText.trim().length > 0;
    const canProceedToAppendToDataset = validatedAlerts !== null && !editValidationError;
    const canAppend =
      targetDataset.length > 0 && exampleName.trim().length > 0 && validatedAlerts !== null;

    // Hook must be called unconditionally (moved from reviewResults to avoid hooks order violation)
    const [diffRendered] = useEuiTextDiff({
      afterText: generatedAlertsCsv,
      beforeText: documentsToCsv(existingAlerts),
    });

    // Auto-focus inputs and buttons when entering specific steps
    useEffect(() => {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        switch (currentStep) {
          case 'defineFields':
            // Focus new fields textarea
            newFieldsTextareaRef.current?.focus();
            break;
          case 'reviewResults':
            // Focus Next button
            nextButtonRef.current?.focus();
            break;
          case 'appendToDataset':
            // Initialize target dataset to selected dataset from selectExample
            if (selectedDataset.length > 0 && targetDataset.length === 0) {
              setTargetDataset(selectedDataset);
            }
            break;
        }
      }, 0);
    }, [currentStep, selectedDataset, targetDataset]);

    const isNextDisabled = useMemo(() => {
      switch (currentStep) {
        case 'selectExample':
          return !canProceedToDefineFields;
        case 'defineFields':
          return !canProceedToGeneratePreview;
        case 'generatePreview':
          return true; // No next on generatePreview, must generate
        case 'reviewResults':
          return !canProceedToAppendToDataset;
        case 'appendToDataset':
          return true; // Last step
        default:
          return true;
      }
    }, [
      currentStep,
      canProceedToDefineFields,
      canProceedToGeneratePreview,
      canProceedToAppendToDataset,
    ]);

    const renderStepContent = () => {
      switch (currentStep) {
        case 'selectExample':
          return (
            <SelectExampleStep
              datasetOptions={datasetOptions}
              exampleOptions={exampleOptions}
              handleDatasetChange={handleDatasetChange}
              handleExampleChange={handleExampleChange}
              isExamplesError={isExamplesError}
              isLoadingExamples={isLoadingExamples}
              selectedDataset={selectedDataset}
              selectedExample={selectedExample}
            />
          );

        case 'defineFields':
          return (
            <DefineFieldsStep
              handleNewFieldsChange={handleNewFieldsChange}
              newFieldsText={newFieldsText}
              newFieldsTextareaRef={newFieldsTextareaRef}
            />
          );

        case 'generatePreview':
          return (
            <GeneratePreviewStep
              canGenerate={canGenerate}
              generationError={generationError}
              handleGeneratePreview={handleGeneratePreview}
              handleModelChange={handleModelChange}
              handlePromptChange={handlePromptChange}
              isChatLoading={isChatLoading}
              isGenerating={isGenerating}
              modelOptions={modelOptions}
              promptText={promptText}
              selectedModel={selectedModel}
            />
          );

        case 'reviewResults':
          return (
            <ReviewResultsStep
              diffRendered={diffRendered}
              editValidationError={editValidationError}
              existingAlerts={existingAlerts}
              generatedAlertsCsv={generatedAlertsCsv}
              handleGeneratedAlertsCsvEdit={handleGeneratedAlertsCsvEdit}
              handleViewModeChange={handleViewModeChange}
              validatedAlerts={validatedAlerts}
              viewMode={viewMode}
            />
          );

        case 'appendToDataset':
          return (
            <AppendToDatasetStep
              canAppend={canAppend}
              datasetOptions={datasetOptions}
              exampleName={exampleName}
              handleAppendToDataset={handleAppendToDataset}
              handleExampleNameChange={handleExampleNameChange}
              handleTargetDatasetChange={handleTargetDatasetChange}
              isAppending={isAppending}
              targetDataset={targetDataset}
            />
          );

        default:
          return null;
      }
    };

    const getStepTitle = () => {
      switch (currentStep) {
        case 'selectExample':
          return i18n.SELECT_EXAMPLE_TITLE;
        case 'defineFields':
          return i18n.DEFINE_FIELDS_TITLE;
        case 'generatePreview':
          return i18n.GENERATE_PREVIEW_TITLE;
        case 'reviewResults':
          return i18n.REVIEW_RESULTS_TITLE;
        case 'appendToDataset':
          return i18n.APPEND_TO_DATASET_TITLE;
        default:
          return '';
      }
    };

    const isLastStep = currentStep === 'appendToDataset';

    return (
      <EuiModal aria-labelledby={modalTitleId} onClose={onClose} style={{ minWidth: '600px' }}>
        <EuiModalHeader>
          <EuiModalHeaderTitle id={modalTitleId}>
            {i18n.EXAMPLE_GENERATION_MODAL_TITLE}
          </EuiModalHeaderTitle>
        </EuiModalHeader>

        <EuiModalBody>
          <EuiText size="m">
            <h3>{getStepTitle()}</h3>
          </EuiText>
          <EuiSpacer size="m" />
          {renderStepContent()}
        </EuiModalBody>

        <EuiModalFooter>
          <EuiButtonEmpty onClick={onClose}>{i18n.MODAL_CLOSE_BUTTON}</EuiButtonEmpty>
          {!isLastStep && (
            <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <EuiButton disabled={currentStep === 'selectExample'} onClick={backToPreviousStep}>
                  {i18n.MODAL_BACK_BUTTON}
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  buttonRef={nextButtonRef}
                  data-test-subj="nextButton"
                  disabled={isNextDisabled}
                  fill
                  onClick={advanceToNextStep}
                >
                  {i18n.MODAL_NEXT_BUTTON}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
          {isLastStep && (
            <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <EuiButton onClick={backToPreviousStep}>{i18n.MODAL_BACK_BUTTON}</EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
        </EuiModalFooter>
      </EuiModal>
    );
  });

AttackDiscoveryExampleGenerationModal.displayName = 'AttackDiscoveryExampleGenerationModal';
