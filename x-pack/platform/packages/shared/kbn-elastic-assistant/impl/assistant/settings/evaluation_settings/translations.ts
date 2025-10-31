/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const SETTINGS_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.settingsTitle',
  {
    defaultMessage: 'Evaluation',
  }
);
export const SETTINGS_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.settingsDescription',
  {
    defaultMessage:
      'Run predictions against LangSmith test data sets using different models (connectors) and graphs.',
  }
);

export const RUN_DETAILS_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.runDetailsTitle',
  {
    defaultMessage: 'Run Details',
  }
);

export const RUN_DETAILS_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.runDetailsDescription',
  {
    defaultMessage: 'Configure test run details like the run name and dataset.',
  }
);

export const PREDICTION_DETAILS_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.predictionDetailsTitle',
  {
    defaultMessage: 'Predictions',
  }
);

export const PREDICTION_DETAILS_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.predictionDetailsDescription',
  {
    defaultMessage:
      'Choose models (connectors) and corresponding graphs the dataset should run against.',
  }
);

export const RUN_NAME_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.runNameLabel',
  {
    defaultMessage: 'Run name',
  }
);

export const RUN_NAME_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.runNameDescription',
  {
    defaultMessage: 'Name for this specific test run.',
  }
);

export const RUN_NAME_PLACEHOLDER = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.runNamePlaceholder',
  {
    defaultMessage: '8.16 Streaming Regression',
  }
);

export const CONNECTORS_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.connectorsLabel',
  {
    defaultMessage: 'Connectors / Models',
  }
);

export const EVALUATOR_MODEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.evaluatorModelLabel',
  {
    defaultMessage: 'Evaluator model (optional)',
  }
);

export const DEFAULT_MAX_ALERTS = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.defaultMaxAlertsLabel',
  {
    defaultMessage: 'Default max alerts',
  }
);

export const EVALUATOR_MODEL_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.evaluatorModelDescription',
  {
    defaultMessage:
      'Judge the quality of all predictions using a single model. (Default: use the same model as the connector)',
  }
);

export const DEFAULT_MAX_ALERTS_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.defaultMaxAlertsDescription',
  {
    defaultMessage:
      'The default maximum number of alerts to send as context, which may be overridden by the Example input',
  }
);

export const CONNECTORS_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.connectorsDescription',
  {
    defaultMessage: 'Select models to evaluate the dataset against.',
  }
);

export const GRAPHS_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.graphsLabel',
  {
    defaultMessage: 'Graphs',
  }
);

export const GRAPHS_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.graphsDescription',
  {
    defaultMessage: 'Select a graph to evaluate the dataset against.',
  }
);

export const SHOW_TRACE_OPTIONS = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.showTraceOptionsLabel',
  {
    defaultMessage: 'Show Trace Options (for internal use only)',
  }
);

export const APM_URL_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.apmUrlLabel',
  {
    defaultMessage: 'APM URL',
  }
);

export const APM_URL_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.apmUrlDescription',
  {
    defaultMessage:
      'URL for the Kibana APM app. Used to link to APM traces for evaluation results. Defaults to "{defaultUrlPath}".',
    values: {
      defaultUrlPath: '${basePath}/app/apm',
    },
  }
);

export const LANGSMITH_PROJECT_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.langSmithProjectLabel',
  {
    defaultMessage: 'LangSmith Project',
  }
);

export const LANGSMITH_PROJECT_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.langSmithProjectDescription',
  {
    defaultMessage: 'LangSmith Project to write traces to.',
  }
);

export const LANGSMITH_API_KEY_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.langSmithApiKeyLabel',
  {
    defaultMessage: 'LangSmith API Key',
  }
);

export const LANGSMITH_API_KEY_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.langSmithApiKeyDescription',
  {
    defaultMessage:
      'API Key for writing traces to LangSmith. Stored in Session Storage. Close tab to clear session.',
  }
);

export const EVALUATOR_DATASET_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.evaluatorDatasetLabel',
  {
    defaultMessage: 'LangSmith Dataset',
  }
);

export const LANGSMITH_DATASET_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.langsmithDatasetDescription',
  {
    defaultMessage:
      'Name of dataset hosted on LangSmith to evaluate. Must manually enter on cloud environments.',
  }
);

export const LANGSMITH_DATASET_PLACEHOLDER = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.langsmithDatasetPlaceholder',
  {
    defaultMessage: 'Select dataset...',
  }
);

export const PERFORM_EVALUATION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.performEvaluationTitle',
  {
    defaultMessage: 'Perform evaluation...',
  }
);

// Attack Discovery Example Generation Section
export const EXAMPLE_GENERATION_SECTION_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.exampleGenerationSectionTitle',
  {
    defaultMessage: 'Evaluate new default anonymization fields',
  }
);

export const EXAMPLE_GENERATION_SECTION_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.exampleGenerationSectionDescription',
  {
    defaultMessage:
      'Generate example data to evaluate new default anonymization fields. Existing dataset examples will be used as a base for the new examples.',
  }
);

export const GENERATE_EXAMPLE_BUTTON = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generateExampleButton',
  {
    defaultMessage: 'Generate examples...',
  }
);

// Modal Translations
export const EXAMPLE_GENERATION_MODAL_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.exampleGenerationModalTitle',
  {
    defaultMessage: 'Generate examples',
  }
);

export const MODAL_CLOSE_BUTTON = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.modalCloseButton',
  {
    defaultMessage: 'Close',
  }
);

export const MODAL_BACK_BUTTON = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.modalBackButton',
  {
    defaultMessage: 'Back',
  }
);

export const MODAL_NEXT_BUTTON = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.modalNextButton',
  {
    defaultMessage: 'Next',
  }
);

// Select Example: Combined dataset and example selection
export const SELECT_EXAMPLE_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExampleTitle',
  {
    defaultMessage: 'Select an example',
  }
);

export const SELECT_EXAMPLE_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExampleDescription',
  {
    defaultMessage: 'Choose a LangSmith dataset and an existing example to use as a base.',
  }
);

export const SELECT_EXAMPLE_DATASET_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExampleDatasetLabel',
  {
    defaultMessage: 'Dataset',
  }
);

export const SELECT_EXAMPLE_DATASET_PLACEHOLDER = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExampleDatasetPlaceholder',
  {
    defaultMessage: 'Select a dataset...',
  }
);

export const SELECT_EXAMPLE_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExampleLabel',
  {
    defaultMessage: 'Example',
  }
);

export const SELECT_EXAMPLE_PLACEHOLDER = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExamplePlaceholder',
  {
    defaultMessage: 'Select an example...',
  }
);

export const SELECT_EXAMPLE_NO_EXAMPLES_FOUND = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExampleNoExamplesFound',
  {
    defaultMessage: 'No examples found in the selected dataset',
  }
);

export const SELECT_EXAMPLE_LOADING_EXAMPLES = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExampleLoadingExamples',
  {
    defaultMessage: 'Loading examples...',
  }
);

export const SELECT_EXAMPLE_ERROR_LOADING_EXAMPLES = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.selectExampleErrorLoadingExamples',
  {
    defaultMessage: 'Error loading examples from dataset',
  }
);

// Define Fields: New Anonymization Fields
export const DEFINE_FIELDS_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.defineFieldsTitle',
  {
    defaultMessage: 'New Default Anonymization Fields',
  }
);

export const DEFINE_FIELDS_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.defineFieldsDescription',
  {
    defaultMessage:
      'Enter additional field names to include in the example alerts. One field name per line.',
  }
);

export const DEFINE_FIELDS_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.defineFieldsLabel',
  {
    defaultMessage: 'Field Names',
  }
);

export const DEFINE_FIELDS_PLACEHOLDER = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.defineFieldsPlaceholder',
  {
    defaultMessage: 'container.id\ncontainer.name\nregistry.key\nregistry.value\nservice.name',
  }
);

// Generate Preview: Generate Preview
export const GENERATE_PREVIEW_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewTitle',
  {
    defaultMessage: 'Generate Preview',
  }
);

export const GENERATE_PREVIEW_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewDescription',
  {
    defaultMessage:
      'Select a model and optionally customize the prompt used to generate augmented alerts.',
  }
);

export const GENERATE_PREVIEW_MODEL_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewModelLabel',
  {
    defaultMessage: 'Model / Connector',
  }
);

export const GENERATE_PREVIEW_MODEL_PLACEHOLDER = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewModelPlaceholder',
  {
    defaultMessage: 'Select a model...',
  }
);

export const GENERATE_PREVIEW_PROMPT_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewPromptLabel',
  {
    defaultMessage: 'Generation Prompt',
  }
);

export const GENERATE_PREVIEW_DEFAULT_PROMPT = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewDefaultPrompt',
  {
    defaultMessage: `You are augmenting (adding additional field values, but never removing them) to security alert data for evaluation purposes.

**TASK**
Add new fields to each alert ONLY when contextually appropriate, with realistic values. Return each alert UNMODIFIED if no new fields are appropriate.

**CRITICAL REQUIREMENTS**
- Always return every alert you are given
- Always return every field in the existing alerts
- Always return all existing fields in the same order as the original alerts
- Always return all existing alerts in the same order
- Always add each new field on it's own line
- Always seperate each alert with two empty lines (\\n\\n)

The output will be programmatically parsed. Format deviations from critical requirements will cause failures.

**OUTPUT FORMAT**
- CSV format: field,value1,value2,value3 on each line
- No explanatory text, headers, or markdown blocks
- Properly escape special characters for JSON

**QUALITY CHECK**
- Verify you have returned the exact number of alerts you were given
`,
  }
);

export const GENERATE_PREVIEW_BUTTON = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewButton',
  {
    defaultMessage: 'Generate Preview',
  }
);

export const GENERATE_PREVIEW_GENERATING = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewGenerating',
  {
    defaultMessage: 'Generating...',
  }
);

export const GENERATE_PREVIEW_ERROR = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewError',
  {
    defaultMessage: 'Error generating preview',
  }
);

export const GENERATE_PREVIEW_VALIDATION_ERROR = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.generatePreviewValidationError',
  {
    defaultMessage: 'Generated content does not match expected Document array format',
  }
);

// Review Results: Review and Copy
export const REVIEW_RESULTS_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsTitle',
  {
    defaultMessage: 'Review generated examples',
  }
);

export const REVIEW_RESULTS_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsDescription',
  {
    defaultMessage: 'Review and optionally edit the generated alerts.',
  }
);

export const REVIEW_RESULTS_PREVIEW_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsPreviewLabel',
  {
    defaultMessage: 'Generated Alerts',
  }
);

export const REVIEW_RESULTS_COPY_BUTTON = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsCopyButton',
  {
    defaultMessage: 'Copy New Example to Clipboard',
  }
);

export const REVIEW_RESULTS_COPY_SUCCESS_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsCopySuccessTitle',
  {
    defaultMessage: 'Copied to clipboard',
  }
);

export const REVIEW_RESULTS_COPY_SUCCESS_MESSAGE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsCopySuccessMessage',
  {
    defaultMessage: 'Example copied successfully. You can now add it to your LangSmith dataset.',
  }
);

export const REVIEW_RESULTS_COPY_ERROR_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsCopyErrorTitle',
  {
    defaultMessage: 'Copy failed',
  }
);

export const REVIEW_RESULTS_FINAL_VALIDATION_ERROR = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsFinalValidationError',
  {
    defaultMessage: 'Final example validation failed',
  }
);

export const REVIEW_RESULTS_HELP_TEXT = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsHelpText',
  {
    defaultMessage:
      'The new example can be manually added to the existing dataset in the LangSmith UI. With anonymizedAlerts populated, the evaluation will use alert replay (skipping the retrieve_anonymized_alerts step). You can go back to regenerate or close when finished.',
  }
);

export const REVIEW_RESULTS_VIEW_MODE_DIFF = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsViewModeDiff',
  {
    defaultMessage: 'Diff',
  }
);

export const REVIEW_RESULTS_VIEW_MODE_EDIT = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsViewModeEdit',
  {
    defaultMessage: 'Edit',
  }
);

export const REVIEW_RESULTS_TOGGLE_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsToggleLabel',
  {
    defaultMessage: 'View mode',
  }
);

export const REVIEW_RESULTS_ORIGINAL_COUNT_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsOriginalCountLabel',
  {
    defaultMessage: 'Original alerts',
  }
);

export const REVIEW_RESULTS_GENERATED_COUNT_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsGeneratedCountLabel',
  {
    defaultMessage: 'Generated alerts',
  }
);

export const REVIEW_RESULTS_COUNTS_MATCH = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsCountsMatch',
  {
    defaultMessage: 'Alert counts match',
  }
);

export const REVIEW_RESULTS_COUNTS_MISMATCH = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.reviewResultsCountsMismatch',
  {
    defaultMessage: 'Alert counts do not match',
  }
);

// Append to Dataset: Append to Dataset
export const APPEND_TO_DATASET_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetTitle',
  {
    defaultMessage: 'Add New Example',
  }
);

export const APPEND_TO_DATASET_DESCRIPTION = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetDescription',
  {
    defaultMessage: 'Select a LangSmith dataset to append a new example',
  }
);

export const APPEND_TO_DATASET_DATASET_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetDatasetLabel',
  {
    defaultMessage: 'Dataset',
  }
);

export const APPEND_TO_DATASET_DATASET_PLACEHOLDER = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetDatasetPlaceholder',
  {
    defaultMessage: 'Select a dataset',
  }
);

export const APPEND_TO_DATASET_EXAMPLE_NAME_LABEL = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetExampleNameLabel',
  {
    defaultMessage: 'New Example name',
  }
);

export const APPEND_TO_DATASET_EXAMPLE_NAME_PLACEHOLDER = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetExampleNamePlaceholder',
  {
    defaultMessage: 'Enter example name',
  }
);

export const APPEND_TO_DATASET_BUTTON = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetButton',
  {
    defaultMessage: 'Add New Example',
  }
);

export const APPEND_TO_DATASET_APPENDING = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetAppending',
  {
    defaultMessage: 'Appending...',
  }
);

export const APPEND_TO_DATASET_SUCCESS_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetSuccessTitle',
  {
    defaultMessage: 'Example appended successfully',
  }
);

export const APPEND_TO_DATASET_SUCCESS_MESSAGE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetSuccessMessage',
  {
    defaultMessage: 'The example has been successfully added to the dataset in LangSmith.',
  }
);

export const APPEND_TO_DATASET_ERROR_TITLE = i18n.translate(
  'xpack.elasticAssistant.assistant.settings.evaluationSettings.appendToDatasetErrorTitle',
  {
    defaultMessage: 'Failed to append example',
  }
);
