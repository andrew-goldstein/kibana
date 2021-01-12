/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { i18n } from '@kbn/i18n';

export const ADD_FIELD = i18n.translate('xpack.securitySolution.rowRendererEditor.addFieldLabel', {
  defaultMessage: 'Add Field',
});

export const CANCEL = i18n.translate('xpack.securitySolution.rowRendererEditor.cancelButton', {
  defaultMessage: 'Cancel',
});

export const CREATE_EVENT_RENDERER_SCREEN_READER_ONLY = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.createEventRendererScreenReaderOnly',
  {
    defaultMessage: 'You are in the Event Renderer editor. Press Escape to exit.',
  }
);

export const DESCRIPTION_LABEL = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.descriptionLabel',
  {
    defaultMessage: 'Event Renderer description',
  }
);

export const DESCRIPTION_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.descriptionPlaceholder',
  {
    defaultMessage: 'Description',
  }
);

export const HIDE_AST = i18n.translate('xpack.securitySolution.rowRendererEditor.hideAstLabel', {
  defaultMessage: 'Hide editor AST',
});

export const ICON_LABEL = i18n.translate('xpack.securitySolution.rowRendererEditor.iconLabel', {
  defaultMessage: 'Icon',
});

export const INITIAL_EXAMPLE = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.initialExampleMarkdown',
  {
    defaultMessage: `## Create Event Renderer
~~Drag and drop fields into the markdown editor~~, or click the \`Add Field\` button in the editor toolbar.

The syntax for displaying draggable fields is shown in the example below:
`,
  }
);

export const JSON_PARSE_ERROR = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.jsonParseErrorMessage',
  {
    defaultMessage: 'Unable to parse field JSON configuration',
  }
);

export const MARKDOWN_EDITOR_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.markdownEditorAriaLabel',
  {
    defaultMessage: 'Event Renderer markdown editor',
  }
);

export const NAME_LABEL = i18n.translate('xpack.securitySolution.rowRendererEditor.nameLabel', {
  defaultMessage: 'Event Renderer name',
});

export const NAME_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.namePlaceholder',
  {
    defaultMessage: 'Name',
  }
);

export const NONE = i18n.translate('xpack.securitySolution.rowRendererEditor.noneLabel', {
  defaultMessage: 'none',
});

export const SHOW_WHEN_ALERTS_MATCH = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.showWhenAlertsMatch',
  {
    defaultMessage: 'Show this Event Renderer when alerts match',
  }
);

export const SAVE = i18n.translate('xpack.securitySolution.rowRendererEditor.saveButton', {
  defaultMessage: 'Save',
});

export const SHOW_AST = i18n.translate('xpack.securitySolution.rowRendererEditor.showAstLabel', {
  defaultMessage: 'Show editor AST',
});

export const STEP1 = i18n.translate('xpack.securitySolution.rowRendererEditor.step1Title', {
  defaultMessage: 'Step 1 - Design your event renderer',
});

export const STEP2 = i18n.translate('xpack.securitySolution.rowRendererEditor.step2Title', {
  defaultMessage: 'Step 2 - Show this event renderer when',
});

export const STEP3 = i18n.translate('xpack.securitySolution.rowRendererEditor.step3Title', {
  defaultMessage: 'Step 3 - Give it a name',
});

export const SHOW_WHEN_EVENTS_MATCH = i18n.translate(
  'xpack.securitySolution.rowRendererEditor.showWhenEventsMatch',
  {
    defaultMessage: 'Show this Event Renderer when events match',
  }
);
