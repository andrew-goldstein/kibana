/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import {
  checkDecidePrivilegesStepCommonDefinition,
  isExternalResumePrincipal,
} from '@kbn/proposals-common';
import type { ProposalPrivilegesChecker } from '../services/check_proposal_privileges';
import type { ProposalsService } from '../services/proposals_service';
import { parseStepInput } from './parse_step_input';
import { toStepError } from './to_step_error';

/**
 * Answers "may this resumer decide?" behind the gate, where the principal is
 * the approver rather than the Worker that created the proposal.
 *
 * The one step here that does not fail on a denial. A refusal is a recoverable
 * state — the gate can be re-parked for someone who does have the privilege —
 * whereas a failure here would spend the gate and strand the proposal.
 */
export const getCheckDecidePrivilegesStepDefinition = ({
  getProposalsService,
  privileges,
}: {
  /** Only to report a refusal; the check itself never reads the proposal. */
  getProposalsService: () => ProposalsService;
  privileges: ProposalPrivilegesChecker;
}) =>
  createServerStepDefinition({
    ...checkDecidePrivilegesStepCommonDefinition,
    handler: async (context) => {
      try {
        const { proposalId, respondedBy } = parseStepInput(
          checkDecidePrivilegesStepCommonDefinition.inputSchema,
          context.input
        );
        const spaceId = context.contextManager.getContext().workflow.spaceId;

        // A refusal is reported here because the gate re-parks on it without
        // the service ever seeing the attempt. Never allowed to fail the step:
        // the refusal is the answer, and the telemetry only describes it.
        const reportRefusal = async (reason: 'external_principal' | 'unprivileged') => {
          try {
            await getProposalsService().reportResumeRejected({ id: proposalId, reason, spaceId });
          } catch (error) {
            context.logger.debug(
              `Did not report the refused decision on proposal ${proposalId}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        };

        // Refused without consulting the privilege service at all: on this path
        // the execution identity is the workflow runner, so a check would
        // authorize the Worker rather than the person who clicked the link.
        if (isExternalResumePrincipal(respondedBy)) {
          context.logger.warn(
            `Proposal ${proposalId} cannot be decided through an external resume, whose execution identity is the workflow runner rather than the responder`
          );
          await reportRefusal('external_principal');
          return { output: { canDecide: false } };
        }

        const canDecide = await privileges.canManage(context.contextManager.getFakeRequest());

        if (!canDecide) {
          context.logger.info(`Resumer is not allowed to decide proposal ${proposalId}`);
          await reportRefusal('unprivileged');
        }

        return { output: { canDecide } };
      } catch (error) {
        // Deliberately not swallowed into `canDecide: false`: a privilege
        // service that is down is not the same thing as a refusal, and a loop
        // that treats it as one would re-park forever.
        throw toStepError(error, 'Failed to check proposal decide privileges');
      }
    },
  });
