/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import { useAssistantContext } from '@kbn/elastic-assistant';

import type { ActionTriggeredGeneration } from '../../monitoring/types';
import { ActionTriggeredRunsTable } from '../../monitoring/action_triggered_runs_table';
import { EmptyPage } from '../../monitoring/empty_page';
import { SearchAndFilter } from '../../monitoring/search_and_filter';
import { useActionTriggeredGenerations } from '../../monitoring/use_action_triggered_generations';
import { useWorkflowTracking } from '../../../hooks/use_workflow_tracking';
import { WorkflowExecutionDetailsFlyout } from '../../../loading_callout/workflow_execution_details_flyout';
import * as i18n from './translations';

export interface UseMonitoringView {
  actionButtons: React.ReactNode;
  monitoringView: React.ReactNode;
}

const DEFAULT_END = 'now';
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_START = 'now-24h';

const STATUS_TO_GENERATION_STATUS: Record<string, 'started' | 'succeeded' | 'failed'> = {
  failed: 'failed',
  running: 'started',
  succeeded: 'succeeded',
};

export const useMonitoringView = (): UseMonitoringView => {
  const { http } = useAssistantContext();

  const [end, setEnd] = useState(DEFAULT_END);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [start, setStart] = useState(DEFAULT_START);
  const [statusFilter, setStatusFilter] = useState<string[] | undefined>(undefined);

  const { data, isError, isLoading, refetch } = useActionTriggeredGenerations({
    end,
    from: pageIndex * pageSize,
    http,
    search,
    size: pageSize,
    start,
    status: statusFilter,
  });

  const handlePageChange = useCallback(({ index, size }: { index: number; size: number }) => {
    setPageIndex(index);
    setPageSize(size);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearch(newSearch || undefined);
    setPageIndex(0);
  }, []);

  const handleStatusChange = useCallback((newStatuses: string[]) => {
    setStatusFilter(newStatuses.length > 0 ? newStatuses : undefined);
    setPageIndex(0);
  }, []);

  const handleTimeChange = useCallback((newStart: string, newEnd: string) => {
    setEnd(newEnd);
    setStart(newStart);
    setPageIndex(0);
  }, []);

  const [selectedItem, setSelectedItem] = useState<ActionTriggeredGeneration | null>(null);

  const { data: trackingData } = useWorkflowTracking({
    executionId: selectedItem?.execution_uuid ?? null,
    http,
  });

  const workflowId = trackingData?.generation?.workflow_id ?? null;
  const workflowRunId = trackingData?.generation?.workflow_run_id ?? null;

  const handleViewDetails = useCallback((item: ActionTriggeredGeneration) => {
    setSelectedItem(item);
  }, []);

  const handleCloseFlyout = useCallback(() => {
    setSelectedItem(null);
  }, []);

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <EuiFlexGroup alignItems="center" direction="column" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner data-test-subj="monitoringLoadingSpinner" size="l" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText color="subdued" size="s">
              {i18n.LOADING}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }

    if (isError) {
      return (
        <EuiCallOut
          announceOnMount
          color="danger"
          data-test-subj="monitoringError"
          iconType="error"
          title={i18n.ERROR_TITLE}
        >
          <p>{i18n.ERROR_DESCRIPTION}</p>
        </EuiCallOut>
      );
    }

    if (data == null || data.total === 0) {
      return <EmptyPage />;
    }

    return (
      <>
        <ActionTriggeredRunsTable
          items={data.data}
          onPageChange={handlePageChange}
          onViewDetails={handleViewDetails}
          pageIndex={pageIndex}
          pageSize={pageSize}
          total={data.total}
        />

        {selectedItem != null && workflowId != null && workflowRunId != null && (
          <WorkflowExecutionDetailsFlyout
            executionUuid={selectedItem.execution_uuid}
            generationStatus={STATUS_TO_GENERATION_STATUS[selectedItem.status]}
            http={http}
            onClose={handleCloseFlyout}
            workflowId={workflowId}
            workflowRunId={workflowRunId}
          />
        )}
      </>
    );
  }, [
    data,
    handleCloseFlyout,
    handlePageChange,
    handleViewDetails,
    http,
    isError,
    isLoading,
    pageIndex,
    pageSize,
    selectedItem,
    workflowId,
    workflowRunId,
  ]);

  const monitoringView = useMemo(
    () => (
      <>
        <SearchAndFilter
          end={end}
          isLoading={isLoading}
          onRefresh={handleRefresh}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
          onTimeChange={handleTimeChange}
          search={search ?? ''}
          selectedStatuses={statusFilter ?? []}
          start={start}
        />

        <EuiSpacer size="m" />

        {content}
      </>
    ),
    [
      content,
      end,
      handleRefresh,
      handleSearchChange,
      handleStatusChange,
      handleTimeChange,
      isLoading,
      search,
      start,
      statusFilter,
    ]
  );

  return { actionButtons: null, monitoringView };
};
