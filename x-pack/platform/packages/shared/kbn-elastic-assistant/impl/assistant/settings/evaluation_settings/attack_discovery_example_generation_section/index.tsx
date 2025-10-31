/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiButton, EuiPanel, EuiSpacer, EuiText, EuiTextColor, EuiTitle } from '@elastic/eui';
import * as i18n from '../translations';
import { AttackDiscoveryExampleGenerationModal } from '../attack_discovery_example_generation_modal';

interface AttackDiscoveryExampleGenerationSectionProps {
  datasetOptions: Array<EuiComboBoxOptionOption<string>>;
  modelOptions: Array<EuiComboBoxOptionOption<string>>;
}

/**
 * Attack Discovery Example Generation Section - A standalone section for generating
 * attack discovery example data with additional anonymization fields
 */
export const AttackDiscoveryExampleGenerationSection: React.FC<AttackDiscoveryExampleGenerationSectionProps> =
  React.memo(({ datasetOptions, modelOptions }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const openModal = useCallback(() => setIsModalOpen(true), []);
    const closeModal = useCallback(() => setIsModalOpen(false), []);

    return (
      <>
        {isModalOpen && (
          <AttackDiscoveryExampleGenerationModal
            datasetOptions={datasetOptions}
            modelOptions={modelOptions}
            onClose={closeModal}
          />
        )}
        <EuiPanel hasShadow={false} hasBorder paddingSize="l">
          <EuiTitle size="s">
            <h3>{i18n.EXAMPLE_GENERATION_SECTION_TITLE}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="s">
            <p>
              <EuiTextColor color="subdued">
                {i18n.EXAMPLE_GENERATION_SECTION_DESCRIPTION}
              </EuiTextColor>
            </p>
          </EuiText>
          <EuiSpacer size="m" />
          <EuiButton size="s" onClick={openModal}>
            {i18n.GENERATE_EXAMPLE_BUTTON}
          </EuiButton>
        </EuiPanel>
      </>
    );
  });

AttackDiscoveryExampleGenerationSection.displayName = 'AttackDiscoveryExampleGenerationSection';
