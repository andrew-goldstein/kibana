/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { EuiTableRowCell, EuiTableRow } from '@elastic/eui';
import { EnrichedDeprecationInfo, ResponseError } from '../../../../../../common/types';
import { GlobalFlyout } from '../../../../../shared_imports';
import { useAppContext } from '../../../../app_context';
import { EsDeprecationsTableCells } from '../../es_deprecations_table_cells';
import { DeprecationTableColumns, Status } from '../../../types';
import { IndexSettingsResolutionCell } from './resolution_table_cell';
import { RemoveIndexSettingsFlyout, RemoveIndexSettingsFlyoutProps } from './flyout';
import { IndexSettingsActionsCell } from './actions_table_cell';

const { useGlobalFlyout } = GlobalFlyout;

interface Props {
  deprecation: EnrichedDeprecationInfo;
  rowFieldNames: DeprecationTableColumns[];
  index: number;
}

export const IndexSettingsTableRow: React.FunctionComponent<Props> = ({
  rowFieldNames,
  deprecation,
  index: rowIndex,
}) => {
  const [showFlyout, setShowFlyout] = useState(false);
  const [status, setStatus] = useState<{
    statusType: Status;
    details?: ResponseError;
  }>({ statusType: 'idle' });

  const {
    services: { api },
  } = useAppContext();

  const { addContent: addContentToGlobalFlyout, removeContent: removeContentFromGlobalFlyout } =
    useGlobalFlyout();

  const closeFlyout = useCallback(() => {
    setShowFlyout(false);
    removeContentFromGlobalFlyout('indexSettingsFlyout');
  }, [removeContentFromGlobalFlyout]);

  const removeIndexSettings = useCallback(
    async (index: string, settings: string[]) => {
      setStatus({ statusType: 'in_progress' });

      const { error } = await api.updateIndexSettings(index, settings);

      setStatus({
        statusType: error ? 'error' : 'complete',
        details: error ?? undefined,
      });
      closeFlyout();
    },
    [api, closeFlyout]
  );

  useEffect(() => {
    if (showFlyout) {
      addContentToGlobalFlyout<RemoveIndexSettingsFlyoutProps>({
        id: 'indexSettingsFlyout',
        Component: RemoveIndexSettingsFlyout,
        props: {
          closeFlyout,
          deprecation,
          removeIndexSettings,
          status,
        },
        flyoutProps: {
          onClose: closeFlyout,
          className: 'eui-textBreakWord',
          'data-test-subj': 'indexSettingsDetails',
          'aria-labelledby': 'indexSettingsDetailsFlyoutTitle',
        },
      });
    }
  }, [addContentToGlobalFlyout, deprecation, removeIndexSettings, showFlyout, closeFlyout, status]);

  return (
    <EuiTableRow data-test-subj="deprecationTableRow" key={`deprecation-row-${rowIndex}`}>
      {rowFieldNames.map((field: DeprecationTableColumns) => {
        return (
          <EuiTableRowCell
            key={field}
            truncateText={false}
            data-test-subj={`indexSettingsTableCell-${field}`}
            align={field === 'actions' ? 'right' : 'left'}
          >
            <EsDeprecationsTableCells
              fieldName={field}
              deprecation={deprecation}
              resolutionTableCell={<IndexSettingsResolutionCell status={status} />}
              actionsTableCell={<IndexSettingsActionsCell openFlyout={() => setShowFlyout(true)} />}
            />
          </EuiTableRowCell>
        );
      })}
    </EuiTableRow>
  );
};
