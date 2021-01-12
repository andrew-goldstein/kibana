/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import {
  EuiMarkdownEditorUiPlugin,
  getDefaultEuiMarkdownParsingPlugins,
  getDefaultEuiMarkdownProcessingPlugins,
} from '@elastic/eui';
import React from 'react';

import { Help } from '../help';
import { FieldMarkdownEditor } from '../row_renderer_markdown_editor/field_markdown_editor';
import { FieldMarkdownParser } from '../row_renderer_markdown_editor/field_markdown_parser';
import { FieldMarkdownRenderer } from '../row_renderer_markdown_editor/field_markdown_renderer';

import * as i18n from '../translations';

export const rowRendererEditorPlugin: EuiMarkdownEditorUiPlugin = {
  name: 'rowRendererEditorPlugin',
  button: {
    label: i18n.ADD_FIELD,
    iconType: 'kqlField',
  },
  helpText: <Help />,
  editor: FieldMarkdownEditor,
};

export const rowRendererEditorParsingPluginList = [
  ...getDefaultEuiMarkdownParsingPlugins(),
  FieldMarkdownParser,
];

export const rowRendererEditorProcessingPluginList = getDefaultEuiMarkdownProcessingPlugins();
rowRendererEditorProcessingPluginList[1][1].components.chartDemoPlugin = FieldMarkdownRenderer;
