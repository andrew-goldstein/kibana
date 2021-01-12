/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiSuperSelect } from '@elastic/eui';
import React from 'react';
import styled from 'styled-components';

import { iconNames } from './icon_names';
import * as i18n from '../../../translations';

const Icon = styled(EuiIcon)`
  margin-right: 4px;
`;

interface Option {
  inputDisplay: React.ReactNode;
  value: string;
}

interface Props {
  onChange: (value: string) => void;
  value: string;
}

const IconSelectComponent: React.FC<Props> = ({ onChange, value }) => {
  const options: Option[] = [
    { value: '', inputDisplay: <div>{i18n.NONE}</div> },
    ...iconNames.map((iconName) => ({
      value: iconName,
      inputDisplay: (
        <EuiFlexGroup alignItems="center" gutterSize="none">
          <EuiFlexItem grow={false}>
            <Icon type={iconName} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{iconName}</EuiFlexItem>
        </EuiFlexGroup>
      ),
      'data-test-subj': 'option-warning',
      disabled: true,
    })),
  ];

  return <EuiSuperSelect onChange={onChange} options={options} valueOfSelected={value} />;
};

export const IconSelect = React.memo(IconSelectComponent);
