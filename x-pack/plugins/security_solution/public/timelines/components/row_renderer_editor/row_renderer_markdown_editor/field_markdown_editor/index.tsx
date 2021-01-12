/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiIcon,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
} from '@elastic/eui';
import React, { useCallback, useState } from 'react';
import uuid from 'uuid';

import { StatefulEditDataProvider } from '../../../edit_data_provider';
import { ParsedField } from '../../helpers';
import { DataProviderType } from '../../../timeline/data_providers/data_provider';
import { OnDataProviderEdited } from '../../../timeline/events';
import * as i18n from '../../translations';

import { IconSelect } from './icon_select';

interface Props {
  onCancel: () => void;
  onSave: (markdown: string, { block }: { block: boolean }) => void;
}

const FieldMarkdownEditorComponent: React.FC<Props> = ({ onSave, onCancel }) => {
  const [icon, setIcon] = useState<string>('user');
  const [parsedField, setParsedField] = useState<ParsedField>({
    icon: 'user',
    name: 'user.name',
    operator: ':',
  });

  const timelineId = 'TODO-timeline-id';

  const handleDataProviderEdited: OnDataProviderEdited = useCallback(
    ({ field, operator, value }) => {
      const parsed =
        value != null
          ? {
              name: field,
              operator,
              value,
            }
          : {
              name: field,
              operator,
            };

      setParsedField(icon !== '' ? { icon, ...parsed } : parsed);
    },
    [icon]
  );

  const onChange = useCallback((value: string) => {
    setIcon(value);
  }, []);

  const onSaveClicked = useCallback(() => {
    onSave(`!{field${JSON.stringify(parsedField, null, 1)}}`, {
      block: true,
    });
  }, [parsedField, onSave]);

  return (
    <>
      <EuiModalHeader>
        <EuiModalHeaderTitle>{i18n.ADD_FIELD}</EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiIcon type="user2" />

      <EuiModalBody>
        <EuiForm>
          <EuiFlexGroup gutterSize="none">
            <EuiFlexItem>
              <EuiFormRow label={i18n.ICON_LABEL}>
                <IconSelect onChange={onChange} value={icon} />
              </EuiFormRow>

              <EuiFormRow>
                <StatefulEditDataProvider
                  browserFields={{}}
                  field=""
                  isExcluded={false}
                  onDataProviderEdited={handleDataProviderEdited}
                  operator=":"
                  timelineId={timelineId}
                  value=""
                  type={DataProviderType.default}
                  providerId={`${timelineId}-${uuid.v4()}`}
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiForm>
      </EuiModalBody>
    </>
  );
};

export const FieldMarkdownEditor = React.memo(FieldMarkdownEditorComponent);
