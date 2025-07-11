/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useState, useMemo, useCallback } from 'react';
import { EuiPortal, EuiContextMenuItem } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

import { isAgentRequestDiagnosticsSupported } from '../../../../../../../common/services';
import { isStuckInUpdating } from '../../../../../../../common/services/agent_status';

import type { Agent, AgentPolicy } from '../../../../types';
import { useAuthz } from '../../../../hooks';
import { ContextMenuActions } from '../../../../components';
import {
  AgentUnenrollAgentModal,
  AgentReassignAgentPolicyModal,
  AgentUpgradeAgentModal,
} from '../../components';
import { useAgentRefresh } from '../hooks';
import { isAgentUpgradeable, policyHasFleetServer } from '../../../../services';
import { AgentRequestDiagnosticsModal } from '../../components/agent_request_diagnostics_modal';

import { AgentDetailsJsonFlyout } from './agent_details_json_flyout';

export const AgentDetailsActionMenu: React.FunctionComponent<{
  agent: Agent;
  agentPolicy?: AgentPolicy;
  assignFlyoutOpenByDefault?: boolean;
  onCancelReassign?: () => void;
  onAddRemoveTagsClick: (button: HTMLElement) => void;
}> = memo(
  ({
    agent,
    assignFlyoutOpenByDefault = false,
    onCancelReassign,
    agentPolicy,
    onAddRemoveTagsClick,
  }) => {
    const authz = useAuthz();
    const hasFleetAllPrivileges = authz.fleet.allAgents;
    const refreshAgent = useAgentRefresh();
    const [isReassignFlyoutOpen, setIsReassignFlyoutOpen] = useState(assignFlyoutOpenByDefault);
    const [isUnenrollModalOpen, setIsUnenrollModalOpen] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [isRequestDiagnosticsModalOpen, setIsRequestDiagnosticsModalOpen] = useState(false);
    const [isAgentDetailsJsonFlyoutOpen, setIsAgentDetailsJsonFlyoutOpen] =
      useState<boolean>(false);
    const isUnenrolling = agent.status === 'unenrolling';
    const isAgentUpdating = isStuckInUpdating(agent);

    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const onContextMenuChange = useCallback(
      (open: boolean) => {
        setIsContextMenuOpen(open);
      },
      [setIsContextMenuOpen]
    );

    const hasFleetServer = agentPolicy && policyHasFleetServer(agentPolicy);

    const onClose = useMemo(() => {
      if (onCancelReassign) {
        return onCancelReassign;
      } else {
        return () => setIsReassignFlyoutOpen(false);
      }
    }, [onCancelReassign, setIsReassignFlyoutOpen]);

    const menuItems = [
      ...(hasFleetAllPrivileges && !agentPolicy?.is_managed
        ? [
            <EuiContextMenuItem
              icon="tag"
              onClick={(event) => {
                onAddRemoveTagsClick((event.target as Element).closest('button')!);
              }}
              disabled={!agent.active}
              key="addRemoveTags"
            >
              <FormattedMessage
                id="xpack.fleet.agentList.addRemoveTagsActionText"
                defaultMessage="Add / remove tags"
              />
            </EuiContextMenuItem>,
            <EuiContextMenuItem
              icon="pencil"
              onClick={() => {
                setIsReassignFlyoutOpen(true);
              }}
              disabled={(!agent.active && !agentPolicy) || agentPolicy?.supports_agentless === true}
              key="reassignPolicy"
            >
              <FormattedMessage
                id="xpack.fleet.agentList.reassignActionText"
                defaultMessage="Assign to new policy"
              />
            </EuiContextMenuItem>,
            <EuiContextMenuItem
              icon="refresh"
              disabled={!isAgentUpgradeable(agent) || agentPolicy?.supports_agentless === true}
              onClick={() => {
                setIsUpgradeModalOpen(true);
              }}
              key="upgradeAgent"
              data-test-subj="upgradeBtn"
            >
              <FormattedMessage
                id="xpack.fleet.agentList.upgradeOneButton"
                defaultMessage="Upgrade agent"
              />
            </EuiContextMenuItem>,
          ]
        : []),
      ...(hasFleetAllPrivileges && isAgentUpdating
        ? [
            <EuiContextMenuItem
              icon="refresh"
              onClick={() => {
                setIsUpgradeModalOpen(true);
              }}
              key="restartUpgradeAgent"
              data-test-subj="restartUpgradeBtn"
            >
              <FormattedMessage
                id="xpack.fleet.agentList.restartUpgradeOneButton"
                defaultMessage="Restart upgrade"
              />
            </EuiContextMenuItem>,
          ]
        : []),
      <EuiContextMenuItem
        icon="inspect"
        onClick={() => {
          setIsContextMenuOpen(false);
          setIsAgentDetailsJsonFlyoutOpen(!isAgentDetailsJsonFlyoutOpen);
        }}
        key="agentDetailsJson"
        data-test-subj="viewAgentDetailsJsonBtn"
      >
        <FormattedMessage
          id="xpack.fleet.agentList.viewAgentDetailsJsonText"
          defaultMessage="View agent JSON"
        />
      </EuiContextMenuItem>,
      ...(authz.fleet.readAgents
        ? [
            <EuiContextMenuItem
              icon="download"
              disabled={!isAgentRequestDiagnosticsSupported(agent)}
              onClick={() => {
                setIsRequestDiagnosticsModalOpen(true);
              }}
              data-test-subj="requestAgentDiagnosticsBtn"
              key="requestDiagnostics"
            >
              <FormattedMessage
                id="xpack.fleet.agentList.diagnosticsOneButton"
                defaultMessage="Request diagnostics .zip"
              />
            </EuiContextMenuItem>,
          ]
        : []),
      ...(hasFleetAllPrivileges && !agentPolicy?.is_managed
        ? [
            <EuiContextMenuItem
              icon="trash"
              disabled={
                !hasFleetAllPrivileges || !agent.active || agentPolicy?.supports_agentless === true
              }
              onClick={() => {
                setIsUnenrollModalOpen(true);
              }}
              key="unenrollAgent"
            >
              {isUnenrolling ? (
                <FormattedMessage
                  id="xpack.fleet.agentList.forceUnenrollOneButton"
                  defaultMessage="Force unenroll"
                />
              ) : (
                <FormattedMessage
                  id="xpack.fleet.agentList.unenrollOneButton"
                  defaultMessage="Unenroll agent"
                />
              )}
            </EuiContextMenuItem>,
          ]
        : []),
    ];

    return (
      <>
        {isReassignFlyoutOpen && (
          <EuiPortal>
            <AgentReassignAgentPolicyModal agents={[agent]} onClose={onClose} />
          </EuiPortal>
        )}
        {isUnenrollModalOpen && (
          <EuiPortal>
            <AgentUnenrollAgentModal
              agents={[agent]}
              agentCount={1}
              onClose={() => {
                setIsUnenrollModalOpen(false);
                refreshAgent();
              }}
              useForceUnenroll={isUnenrolling}
              hasFleetServer={hasFleetServer}
            />
          </EuiPortal>
        )}
        {isUpgradeModalOpen && (
          <EuiPortal>
            <AgentUpgradeAgentModal
              agents={[agent]}
              agentCount={1}
              onClose={() => {
                setIsUpgradeModalOpen(false);
                refreshAgent();
              }}
              isUpdating={isAgentUpdating}
            />
          </EuiPortal>
        )}
        {isRequestDiagnosticsModalOpen && (
          <EuiPortal>
            <AgentRequestDiagnosticsModal
              agents={[agent]}
              agentCount={1}
              onClose={() => {
                setIsRequestDiagnosticsModalOpen(false);
              }}
            />
          </EuiPortal>
        )}
        {isAgentDetailsJsonFlyoutOpen && (
          <EuiPortal>
            <AgentDetailsJsonFlyout
              agent={agent}
              onClose={() => setIsAgentDetailsJsonFlyoutOpen(false)}
            />
          </EuiPortal>
        )}
        <ContextMenuActions
          isOpen={isContextMenuOpen}
          onChange={onContextMenuChange}
          button={{
            props: { iconType: 'arrowDown', iconSide: 'right', color: 'primary' },
            children: (
              <FormattedMessage
                id="xpack.fleet.agentDetails.actionsButton"
                defaultMessage="Actions"
              />
            ),
          }}
          items={menuItems}
        />
      </>
    );
  }
);
