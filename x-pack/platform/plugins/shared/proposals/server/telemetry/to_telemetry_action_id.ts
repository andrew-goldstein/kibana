/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CUSTOM_ACTION_ID } from './constants';

/**
 * The action as telemetry may name it: the managed workflow definition id an action workflow
 * was installed from, or `custom` for a workflow no plugin manages. Only a managed install
 * records an `originManagedWorkflowId` (a registered definition's id), so a customer-chosen
 * workflow id can never be the result.
 */
export const toTelemetryActionId = ({
  managed,
  originManagedWorkflowId,
}: {
  managed?: boolean;
  originManagedWorkflowId?: string | null;
}): string => {
  const origin = originManagedWorkflowId?.trim();
  return managed === true && origin ? origin : CUSTOM_ACTION_ID;
};
