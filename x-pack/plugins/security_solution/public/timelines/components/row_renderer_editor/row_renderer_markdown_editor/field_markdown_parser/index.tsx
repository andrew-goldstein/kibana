/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { Plugin } from '@elastic/eui/node_modules/unified';
import { RemarkTokenizer } from '@elastic/eui';

import * as i18n from '../../translations';

export const FieldMarkdownParser: Plugin = function () {
  // NOTE: the use of `this.Parse` and the other idioms below required by the Remark `Plugin` should NOT be replicated outside this file
  const Parser = this.Parser;
  const tokenizers = Parser.prototype.inlineTokenizers;
  const methods = Parser.prototype.inlineMethods;

  const tokenizeField: RemarkTokenizer = function (eat, value, silent) {
    if (value.startsWith('!{field') === false) return false;

    const nextChar = value[7];

    if (nextChar !== '{' && nextChar !== '}') return false; // this isn't actually a field

    if (silent) {
      return true;
    }

    // is there a configuration?
    const hasConfiguration = nextChar === '{';

    let match = '!{field';
    let configuration = {};

    if (hasConfiguration) {
      let configurationString = '';

      let openObjects = 0;

      for (let i = 7; i < value.length; i++) {
        const char = value[i];
        if (char === '{') {
          openObjects++;
          configurationString += char;
        } else if (char === '}') {
          openObjects--;
          if (openObjects === -1) {
            break;
          }
          configurationString += char;
        } else {
          configurationString += char;
        }
      }

      match += configurationString;
      try {
        configuration = JSON.parse(configurationString);
      } catch (e) {
        const now = eat.now();
        this.file.fail(`${i18n.JSON_PARSE_ERROR}: ${e}`, {
          line: now.line,
          column: now.column + 7,
        });
      }
    }

    match += '}';

    return eat(match)({
      type: 'chartDemoPlugin',
      ...configuration,
    });
  };

  tokenizeField.locator = (value: string, fromIndex: number) => {
    return value.indexOf('!{field', fromIndex);
  };

  tokenizers.field = tokenizeField;
  methods.splice(methods.indexOf('text'), 0, 'field');
};
