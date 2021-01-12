/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiMarkdownFormat } from '@elastic/eui';
import React from 'react';

import {
  rowRendererEditorParsingPluginList,
  rowRendererEditorProcessingPluginList,
} from '../../row_renderer_editor_plugin';

interface Props {
  markdown: string;
}

const RowRendererMarkdownFormatterComponent: React.FC<Props> = ({ markdown }) => (
  <EuiMarkdownFormat
    parsingPluginList={rowRendererEditorParsingPluginList}
    processingPluginList={rowRendererEditorProcessingPluginList}
  >
    {markdown}
  </EuiMarkdownFormat>
);

export const RowRendererMarkdownFormatter = React.memo(RowRendererMarkdownFormatterComponent);
