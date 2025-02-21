/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { v4 as uuidv4 } from 'uuid';
import type { GetLensAttributes } from '../../types';
import { COUNT } from '../../translations';

const layerId = uuidv4();
// Exported for testing purposes
export const stackByFieldAccessorId = uuidv4();
export const columnTimestampId = uuidv4();
export const columnCountOfRecordsId = uuidv4();

export const getEventsHistogramLensAttributes: GetLensAttributes = ({
  stackByField,
  extraOptions = {},
}) => {
  return {
    title: 'Events',
    description: '',
    visualizationType: 'lnsXY',
    state: {
      visualization: {
        title: 'Empty XY chart',
        legend: {
          isVisible: true,
          position: 'right',
          legendSize: 'xlarge',
          legendStats: ['currentAndLastValue'],
          showSingleSeries: true,
        },
        valueLabels: 'hide',
        preferredSeriesType: 'bar_stacked',
        layers: [
          {
            layerId,
            accessors: [columnCountOfRecordsId],
            position: 'top',
            seriesType: 'bar_stacked',
            showGridlines: false,
            layerType: 'data',
            xAccessor: columnTimestampId,
            splitAccessor: stackByField ? stackByFieldAccessorId : undefined,
          },
        ],
        yRightExtent: {
          mode: 'full',
        },
        yLeftExtent: {
          mode: 'full',
        },
        axisTitlesVisibilitySettings: {
          x: false,
          yLeft: false,
          yRight: true,
        },
      },
      query: {
        query: '',
        language: 'kuery',
      },
      filters: extraOptions.filters ?? [],
      datasourceStates: {
        formBased: {
          layers: {
            [layerId]: {
              columns: {
                [columnTimestampId]: {
                  label: '@timestamp',
                  dataType: 'date',
                  operationType: 'date_histogram',
                  sourceField: '@timestamp',
                  isBucketed: true,
                  scale: 'interval',
                  params: {
                    interval: 'auto',
                    includeEmptyRows: true,
                  },
                },
                [columnCountOfRecordsId]: {
                  label: COUNT,
                  dataType: 'number',
                  operationType: 'count',
                  isBucketed: false,
                  scale: 'ratio',
                  sourceField: '___records___',
                  params: { emptyAsNull: true },
                },
                ...(stackByField && {
                  [stackByFieldAccessorId]: {
                    label: `Top values of ${stackByField}`,
                    dataType: 'string',
                    operationType: 'terms',
                    scale: 'ordinal',
                    sourceField: `${stackByField}`,
                    isBucketed: true,
                    params: {
                      size: 10,
                      orderBy: {
                        type: 'column',
                        columnId: columnCountOfRecordsId,
                      },
                      orderDirection: 'desc',
                      otherBucket: true,
                      missingBucket: false,
                      parentFormat: {
                        id: 'terms',
                      },
                    },
                  },
                }),
              },
              columnOrder: [
                ...(stackByField ? [stackByFieldAccessorId] : []),
                columnTimestampId,
                columnCountOfRecordsId,
              ],
              incompleteColumns: {},
            },
          },
        },
      },
    },
    references: [
      {
        type: 'index-pattern',
        id: '{dataViewId}',
        name: `indexpattern-datasource-layer-${layerId}`,
      },
    ],
  };
};
