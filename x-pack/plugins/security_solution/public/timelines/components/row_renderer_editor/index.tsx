/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFocusTrap,
  EuiForm,
  EuiFormRow,
  EuiPanel,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiSteps,
  EuiTextArea,
} from '@elastic/eui';
import { pick } from 'lodash/fp';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';

import { isEscape } from '../../../common/components/accessibility/helpers';
import { useDeepEqualSelector } from '../../../common/hooks/use_selector';
import { TimelineEventsType } from '../../../../common/types/timeline';
import { timelineActions, timelineSelectors } from '../../store/timeline';
import { timelineDefaults } from '../../store/timeline/defaults';
import { DataProviders } from '../timeline/data_providers';
import { DataProvider } from '../timeline/data_providers/data_provider';

import {
  EXAMPLE_PROCESS_FIELD_MARKDOWN,
  EXAMPLE_USER_FIELD_MARKDOWN,
  getTimelineId,
} from './helpers';
import { RowRendererMarkdownEditor } from './row_renderer_markdown_editor';

import * as i18n from './translations';

export type OnSaveRowRenderer = ({
  name,
  dataProviders,
  description,
  markdown,
}: {
  name: string;
  dataProviders: DataProvider[];
  description: string;
  markdown: string;
}) => void;

interface Props {
  sampleEventId: string;
  sampleEventType: Omit<TimelineEventsType, 'all'>;
  onCloseEditor: () => void;
  onSaveRowRenderer: OnSaveRowRenderer;
}

const RowRendererEditorComponent: React.FC<Props> = ({
  onCloseEditor,
  onSaveRowRenderer,
  sampleEventId,
  sampleEventType,
}) => {
  const dispatch = useDispatch();
  const getTimeline = useMemo(() => timelineSelectors.getTimelineByIdSelector(), []);
  const { dataProviders } = useDeepEqualSelector((state) =>
    pick(['dataProviders'], getTimeline(state, getTimelineId(sampleEventId)) ?? timelineDefaults)
  );
  const [markdown, setMarkdown] = useState<string>(
    `${i18n.INITIAL_EXAMPLE}\n${EXAMPLE_USER_FIELD_MARKDOWN} ${EXAMPLE_PROCESS_FIELD_MARKDOWN}`
  );
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  useEffect(() => {
    const timelineId = getTimelineId(sampleEventId);

    dispatch(
      timelineActions.createTimeline({
        id: timelineId,
        columns: [],
        indexNames: [],
        expandedEvent: {},
        show: false,
      })
    );
  }, [dispatch, sampleEventId]);

  const onNameChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const onDescriptionChanged = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  }, []);

  const onSave = useCallback(() => {
    onSaveRowRenderer({
      name: name.trim(),
      description,
      dataProviders,
      markdown,
    });
    onCloseEditor();
  }, [name, dataProviders, description, markdown, onCloseEditor, onSaveRowRenderer]);

  const onCancel = useCallback(() => {
    onCloseEditor();
  }, [onCloseEditor]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      event.stopPropagation();

      if (isEscape(event)) {
        onCancel();
      }
    },
    [onCancel]
  );

  const steps = useMemo(
    () => [
      {
        title: i18n.STEP1,
        children: <RowRendererMarkdownEditor markdown={markdown} setMarkdown={setMarkdown} />,
      },
      {
        title: i18n.STEP2,
        children: <DataProviders timelineId={getTimelineId(sampleEventId)} />,
      },
      {
        title: i18n.STEP3,
        children: (
          <EuiForm>
            <EuiFormRow label={i18n.NAME_LABEL}>
              <EuiFieldText
                onChange={onNameChanged}
                placeholder={i18n.NAME_PLACEHOLDER}
                value={name}
              />
            </EuiFormRow>

            <EuiFormRow label={i18n.DESCRIPTION_LABEL}>
              <EuiTextArea
                onChange={onDescriptionChanged}
                placeholder={i18n.DESCRIPTION_PLACEHOLDER}
                value={description}
              />
            </EuiFormRow>

            <EuiSpacer />

            <EuiFlexGroup gutterSize="none" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={onCancel}>{i18n.CANCEL}</EuiButtonEmpty>
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiButton
                  disabled={
                    name.trim().length === 0 ||
                    dataProviders.length === 0 ||
                    markdown.trim().length === 0
                  }
                  fill
                  onClick={onSave}
                >
                  {i18n.SAVE}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiForm>
        ),
      },
    ],
    [
      dataProviders.length,
      description,
      markdown,
      name,
      onCancel,
      onDescriptionChanged,
      onNameChanged,
      onSave,
      sampleEventId,
    ]
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div data-test-subj="rowRendererEditor" onKeyDown={onKeyDown} role="dialog">
      <EuiPanel>
        <EuiFocusTrap>
          <EuiScreenReaderOnly data-test-subj="screenReaderOnly">
            <p>{i18n.CREATE_EVENT_RENDERER_SCREEN_READER_ONLY}</p>
          </EuiScreenReaderOnly>

          <EuiSteps titleSize="xs" steps={steps} />
        </EuiFocusTrap>
      </EuiPanel>
    </div>
  );
};

export const RowRendererEditor = React.memo(RowRendererEditorComponent);
