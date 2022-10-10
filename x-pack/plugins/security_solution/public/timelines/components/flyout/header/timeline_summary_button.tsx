/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiToolTip,
} from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { isEmpty } from 'lodash/fp';
import styled from 'styled-components';
import { FormattedRelative } from '@kbn/i18n-react';

import type { TimelineTabs } from '../../../../../common/types/timeline';
import { TimelineId, TimelineStatus, TimelineType } from '../../../../../common/types/timeline';
import {
  ACTIVE_TIMELINE_BUTTON_CLASS_NAME,
  focusActiveTimelineButton,
} from '../../timeline/helpers';
import { UNTITLED_TIMELINE, UNTITLED_TEMPLATE } from '../../timeline/properties/translations';
import { timelineActions } from '../../../store/timeline';
import * as i18n from './translations';
import { dispatchUpdateTimeline, queryTimelineById } from '../../open_timeline/helpers';
import { updateIsLoading as dispatchUpdateIsLoading } from '../../../store/timeline/actions';

const EventsCountBadge = styled(EuiBadge)`
  margin-left: ${({ theme }) => theme.eui.euiSizeS};
`;

const EuiHealthStyled = styled(EuiHealth)`
  display: block;
`;

const INVALID_COUNT = -1;

interface Props {
  activeTimelineTab: TimelineTabs;
  count: number | undefined;
  timelineId: string;
  timelineStatus: TimelineStatus;
  timelineTitle: string;
  timelineType: TimelineType;
  isActive: boolean;
  isOpen: boolean;
  updated?: number;
}

const ActiveTimelineButton = styled(EuiButton)`
  ${({ theme }) => `border-top: 1px solid ${theme.eui.euiColorPrimary};`}
  ${({ theme }) => `border-left: 1px solid ${theme.eui.euiColorPrimary};`}
  ${({ theme }) => `border-radius: ${theme.eui.euiSizeXS} ${theme.eui.euiSizeXS} 0 0;`}
  ${({ theme }) => `border-right: 1px solid ${theme.eui.euiColorPrimary};`}
`;

const StyledEuiButtonEmpty = styled(EuiButtonEmpty)`
  > span {
    padding: 0;
  }
`;

const TitleConatiner = styled(EuiFlexItem)`
  overflow: hidden;
  display: inline-block;
  text-overflow: ellipsis;
`;

const CloseFlexItem = styled(EuiFlexItem)`
  ${({ theme }) => `margin-left: ${theme.eui.euiSizeXS};`}
`;

const TimelineSummaryButtonComponent: React.FC<Props> = ({
  activeTimelineTab,
  count,
  isActive,
  isOpen,
  timelineId,
  timelineStatus,
  timelineType,
  timelineTitle,
  updated,
}) => {
  const dispatch = useDispatch();
  const handleToggleOpen = useCallback(() => {
    dispatch(timelineActions.showTimeline({ id: timelineId, show: !isOpen }));
    focusActiveTimelineButton();
  }, [dispatch, isOpen, timelineId]);
  const updateTimeline = useMemo(() => dispatchUpdateTimeline(dispatch), [dispatch]);
  const updateIsLoading = useCallback(
    (payload) => dispatch(dispatchUpdateIsLoading(payload)),
    [dispatch]
  );

  const title = !isEmpty(timelineTitle)
    ? timelineTitle
    : timelineType === TimelineType.template
    ? UNTITLED_TEMPLATE
    : UNTITLED_TIMELINE;

  const tooltipContent = useMemo(() => {
    if (timelineStatus === TimelineStatus.draft) {
      return <>{i18n.UNSAVED}</>;
    }
    return (
      <>
        {i18n.AUTOSAVED}{' '}
        <FormattedRelative
          data-test-subj="timeline-status"
          key="timeline-status-autosaved"
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          value={new Date(updated!)}
        />
      </>
    );
  }, [timelineStatus, updated]);

  const ButtonContent = useMemo(
    () => (
      <EuiFlexGroup
        gutterSize="none"
        alignItems="center"
        justifyContent="flexStart"
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          <EuiToolTip position="top" content={tooltipContent}>
            <EuiHealthStyled
              color={timelineStatus === TimelineStatus.draft ? 'warning' : 'success'}
            />
          </EuiToolTip>
        </EuiFlexItem>
        <TitleConatiner grow={false}>{title}</TitleConatiner>
        {count != null && count !== INVALID_COUNT && (
          <EuiFlexItem grow={false}>
            <EventsCountBadge>{count}</EventsCountBadge>
          </EuiFlexItem>
        )}
        <CloseFlexItem grow={false}>
          <EuiButtonIcon
            aria-label={i18n.CLOSE()}
            data-test-subj="closeTimelineButton"
            iconType="cross"
            size="xs"
            onClick={() => {
              dispatch(
                timelineActions.closeTimeline({
                  id: timelineId,
                })
              );
            }}
          />
        </CloseFlexItem>
      </EuiFlexGroup>
    ),
    [count, dispatch, timelineId, timelineStatus, title, tooltipContent]
  );

  return isActive ? (
    <ActiveTimelineButton
      aria-label={i18n.TIMELINE_TOGGLE_BUTTON_ARIA_LABEL({ isOpen, title })}
      className={ACTIVE_TIMELINE_BUTTON_CLASS_NAME}
      data-test-subj="flyoutOverlay"
      size="s"
      isSelected={isOpen}
      onClick={handleToggleOpen}
    >
      {ButtonContent}
    </ActiveTimelineButton>
  ) : (
    <StyledEuiButtonEmpty
      aria-label={i18n.TIMELINE_TOGGLE_BUTTON_ARIA_LABEL({ isOpen, title })}
      data-test-subj="inactiveTimelineButton"
      size="s"
      isSelected={false}
      onClick={() => {
        dispatch(
          timelineActions.deactivateTimeline({
            id: TimelineId.active,
          })
        );

        queryTimelineById({
          activeTimelineTab,
          timelineId,
          timelineType,
          updateIsLoading,
          updateTimeline,
        });

        dispatch(timelineActions.updateActiveTimeline({ id: timelineId }));
      }}
    >
      {ButtonContent}
    </StyledEuiButtonEmpty>
  );
};

export const TimelineSummaryButton = React.memo(TimelineSummaryButtonComponent);
