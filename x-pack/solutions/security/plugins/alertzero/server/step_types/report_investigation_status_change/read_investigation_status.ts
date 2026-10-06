/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TEMPLATE_ID_INVESTIGATION } from '@kbn/alertzero-common';
import type {
  InvestigationCloseReason,
  InvestigationStatus,
} from '../../../common/telemetry/constants';
import { INVESTIGATION_CLOSE_REASONS } from '../../../common/telemetry/constants';

/** The conversation fields the step reads. */
export interface InvestigationConversation {
  metadata?: Record<string, unknown>;
  template_id?: string;
}

export type InvestigationStatusReading =
  | { closeReason?: InvestigationCloseReason; status: InvestigationStatus; valid: true }
  | { reason: 'not_investigation' | 'unknown_status'; valid: false };

const isCloseReason = (value: unknown): value is InvestigationCloseReason =>
  (INVESTIGATION_CLOSE_REASONS as readonly unknown[]).includes(value);

/** Reads `status` absent or empty as `open`, as the investigation template does. */
const toStatus = (value: unknown): InvestigationStatus | undefined => {
  if (value === undefined || value === null || value === '' || value === 'open') {
    return 'open';
  }
  return value === 'closed' ? 'closed' : undefined;
};

/**
 * Reads an Investigation's current status, and its close reason when it is closed. Only closed
 * template values come back: anything else is a skip reason, never the stored value.
 */
export const readInvestigationStatus = ({
  metadata,
  template_id: templateId,
}: InvestigationConversation): InvestigationStatusReading => {
  if (templateId !== TEMPLATE_ID_INVESTIGATION) {
    return { reason: 'not_investigation', valid: false };
  }
  const status = toStatus(metadata?.status);
  if (!status) {
    return { reason: 'unknown_status', valid: false };
  }
  // A reopened Investigation keeps its last close reason, so it is read only while closed.
  const closeReason = metadata?.close_reason;
  return status === 'closed' && isCloseReason(closeReason)
    ? { closeReason, status, valid: true }
    : { status, valid: true };
};
