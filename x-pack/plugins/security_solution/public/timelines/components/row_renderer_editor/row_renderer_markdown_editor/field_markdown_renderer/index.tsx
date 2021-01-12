/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';

import { DraggableBadge } from '../../../../../common/components/draggables';
import { ParsedField } from '../../helpers';

export const FieldMarkdownRenderer = ({ icon, name, operator, value }: ParsedField) => {
  return (
    <DraggableBadge
      contextId={`TODO-contextId`}
      eventId={`TODO-eventId`}
      field={name}
      iconType={icon}
      value={value != null ? `${value}` : undefined}
    />
  );
};
