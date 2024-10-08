/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { Fragment } from 'react';
import { type DataViewField } from '@kbn/data-views-plugin/common';
import type { FieldIconProps, GenericFieldIcon } from './field_icon';
import { type FieldBase } from '../../types';

const Fallback = () => <Fragment />;

const LazyFieldIcon = React.lazy(() => import('./field_icon')) as GenericFieldIcon;

function WrappedFieldIcon<T extends FieldBase = DataViewField>(props: FieldIconProps) {
  return (
    <React.Suspense fallback={<Fallback />}>
      <LazyFieldIcon {...props} />
    </React.Suspense>
  );
}

export const FieldIcon = WrappedFieldIcon;
export type { FieldIconProps };
export { getFieldIconProps } from './get_field_icon_props';
