/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiSpacer, EuiCodeBlock, EuiText } from '@elastic/eui';
import React from 'react';

export const Help = () => (
  <div>
    <EuiCodeBlock language="md" fontSize="l" paddingSize="s" isCopyable>
      {'!{field{options}}'}
    </EuiCodeBlock>
    <EuiSpacer size="s" />
    <EuiText size="xs" style={{ marginLeft: 16 }}>
      <p>Where options can contain:</p>
      <ul>
        <li>
          <strong>palette: </strong>A number between 1-8 for each palette.
        </li>
        <li>
          <strong>categories: </strong>
          The number of categories per column
        </li>
      </ul>
    </EuiText>
  </div>
);
