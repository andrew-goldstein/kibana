/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');
  const { header, common } = getPageObjects(['header', 'common']);
  const esArchiver = getService('esArchiver');
  const dataViews = getService('dataViews');
  const kibanaServer = getService('kibanaServer');

  describe('no data in visualize', function () {
    it('should show the integrations component if there is no data', async () => {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/long_window_logstash'
      );
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      await common.navigateToApp('visualize');
      await header.waitUntilLoadingHasFinished();

      const addIntegrations = await testSubjects.find('kbnOverviewAddIntegrations');
      await addIntegrations.click();
      await common.waitUntilUrlIncludes('integrations/browse');
    });

    it('should show the no dataview component if no dataviews exist', async function () {
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/long_window_logstash'
      );
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      await common.navigateToApp('visualize');
      await header.waitUntilLoadingHasFinished();

      const dataViewToCreate = 'logstash';
      await dataViews.createFromPrompt({ name: dataViewToCreate });

      await retry.waitForWithTimeout(
        'data view selector to include a newly created dataview',
        5000,
        async () => {
          const addNewVizButton = await testSubjects.exists('newItemButton');
          expect(addNewVizButton).to.be(true);
          return addNewVizButton;
        }
      );
    });
  });
}
