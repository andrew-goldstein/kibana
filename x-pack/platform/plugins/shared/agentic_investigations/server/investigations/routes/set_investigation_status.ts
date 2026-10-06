/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { AGENTIC_INVESTIGATIONS_API_VERSION } from '../../../common/constants';
import { INVESTIGATION_STATUS_URL } from '../../../common/investigations/constants';
import { setInvestigationStatusRequestSchema } from '../../../common/investigations/status';
import { assignConversationRequestParamsSchema } from '../../../common/assignments/assignment';
import { INVESTIGATIONS_API_PRIVILEGE_MANAGE } from '../constants';
import type { InvestigationRouteDependencies } from '../types';
import { getWorkflowRequestExecutionId } from '../helpers/get_workflow_request_execution_id';
import type { SetInvestigationStatusOptions } from '../services/investigation_status_service';
import { handleInvestigationRouteError } from './handle_route_error';

export const registerSetInvestigationStatusRoute = ({
  router,
  logger,
  getInvestigationStatusService,
}: InvestigationRouteDependencies) => {
  router.versioned
    .put({
      path: INVESTIGATION_STATUS_URL,
      access: 'internal',
      security: { authz: { requiredPrivileges: [INVESTIGATIONS_API_PRIVILEGE_MANAGE] } },
      summary: 'Open or close an investigation',
    })
    .addVersion(
      {
        version: AGENTIC_INVESTIGATIONS_API_VERSION,
        validate: {
          request: {
            params: buildRouteValidationWithZod(assignConversationRequestParamsSchema),
            body: buildRouteValidationWithZod(setInvestigationStatusRequestSchema),
          },
        },
      },
      async (_context, request, response) => {
        try {
          const workflowOrigin = getWorkflowRequestExecutionId(request);
          // Telemetry labels only: the headers behind them can be set by any caller.
          const options: SetInvestigationStatusOptions = workflowOrigin
            ? {
                closedBy: 'workflow_request',
                reopenedBy: 'workflow_request',
                workflowExecutionId: workflowOrigin.workflowExecutionId,
              }
            : {};
          const result = await getInvestigationStatusService!().setStatus(
            request,
            request.params.id,
            request.body,
            options
          );
          return response.ok({ body: result });
        } catch (error) {
          return handleInvestigationRouteError(error, response, logger);
        }
      }
    );
};
