/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiMarkdownEditor, EuiSpacer, EuiCodeBlock, EuiButton } from '@elastic/eui';
import React, { useCallback, useMemo, useState } from 'react';

import {
  rowRendererEditorParsingPluginList,
  rowRendererEditorPlugin,
  rowRendererEditorProcessingPluginList,
} from '../row_renderer_editor_plugin';
import * as i18n from '../translations';

import { RowRendererMarkdownFormatter } from './row_renderer_markdown_formatter';

const DEFAULT_HEIGHT = 300; // px
interface RowRendererMarkdownEditorProps {
  height?: number;
  markdown: string;
  setMarkdown: (markdown: string) => void;
  showAst?: boolean;
}

const RowRendererMarkdownEditorComponent: React.FC<RowRendererMarkdownEditorProps> = ({
  height = DEFAULT_HEIGHT,
  markdown,
  setMarkdown,
  showAst = false,
}) => {
  const [messages, setMessages] = useState<string[]>([]);
  const [ast, setAst] = useState<string | null>(null);
  const [isAstShowing, setIsAstShowing] = useState(false);
  const onParse = useCallback((error, data) => {
    setMessages(error ? [error] : data.messages);
    setAst(JSON.stringify(data.ast, null, 2));
  }, []);
  const uiPlugins = useMemo(() => [rowRendererEditorPlugin], []);

  return (
    <>
      <RowRendererMarkdownFormatter markdown={markdown} />

      <EuiSpacer size="s" />

      <EuiMarkdownEditor
        aria-label={i18n.MARKDOWN_EDITOR_ARIA_LABEL}
        value={markdown}
        onChange={setMarkdown}
        height={height}
        uiPlugins={uiPlugins}
        parsingPluginList={rowRendererEditorParsingPluginList}
        processingPluginList={rowRendererEditorProcessingPluginList}
        onParse={onParse}
        errors={messages}
      />

      <EuiSpacer size="s" />

      {showAst && (
        <>
          <div className="eui-textRight">
            <EuiButton
              size="s"
              iconType={isAstShowing ? 'eyeClosed' : 'eye'}
              onClick={() => setIsAstShowing(!isAstShowing)}
              fill={isAstShowing}
            >
              {isAstShowing ? i18n.HIDE_AST : i18n.SHOW_AST}
            </EuiButton>
          </div>
          {isAstShowing && <EuiCodeBlock language="json">{ast}</EuiCodeBlock>}
        </>
      )}
    </>
  );
};

export const RowRendererMarkdownEditor = React.memo(RowRendererMarkdownEditorComponent);
