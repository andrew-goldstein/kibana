/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type {
  AgentFormattedAttachment,
  AttachmentFormatContext,
  AttachmentTypeDefinition,
} from '@kbn/agent-builder-server/attachments';
import { z } from '@kbn/zod/v4';

import { ATTACK_DISCOVERY_VERDICT_ATTACHMENT_TYPE } from '../../../../common/constants';

/**
 * The FP/TP conclusion about one attack.
 *
 * Structured rather than a markdown blob: the verdict is an enum a reader can
 * branch on, and the bounds keep a single attachment from dominating the
 * conversation's context.
 */
export const attackDiscoveryVerdictAttachmentDataSchema = z.object({
  rationale_markdown: z.string().max(50_000).optional(),
  summary_markdown: z.string().max(8000),
  verdict: z.enum(['false_positive', 'true_positive', 'inconclusive', 'failed']),
});

export type AttackDiscoveryVerdictAttachmentData = z.infer<
  typeof attackDiscoveryVerdictAttachmentDataSchema
>;

const isAttackDiscoveryVerdictAttachmentData = (
  data: unknown
): data is AttackDiscoveryVerdictAttachmentData =>
  attackDiscoveryVerdictAttachmentDataSchema.safeParse(data).success;

const formatVerdict = (data: AttackDiscoveryVerdictAttachmentData): string =>
  [
    `# Analysis verdict: ${data.verdict}`,
    '',
    data.summary_markdown,
    ...(data.rationale_markdown != null ? ['', '## Rationale', data.rationale_markdown] : []),
  ].join('\n');

/**
 * Creates the server-side definition for the `security.attack_discovery.verdict`
 * attachment type.
 *
 * PR-SPLIT #19022: the FP/TP verdict attachment type.
 *
 * By value: the verdict is produced by the review that writes it and is persisted
 * nowhere else, so there is nothing to resolve an `origin` against. The markdown a
 * reader sees is rendered here from the fields rather than assembled by the
 * workflow, which is what keeps the verdict an enum instead of prose.
 */
export const createAttackDiscoveryVerdictAttachmentType = (): AttachmentTypeDefinition => ({
  id: ATTACK_DISCOVERY_VERDICT_ATTACHMENT_TYPE,

  validate: (input) => {
    const result = attackDiscoveryVerdictAttachmentDataSchema.safeParse(input);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error.message };
  },

  format: (
    attachment: Attachment<string, unknown>,
    _context: AttachmentFormatContext
  ): AgentFormattedAttachment => ({
    getRepresentation: () => {
      if (!isAttackDiscoveryVerdictAttachmentData(attachment.data)) {
        throw new Error(
          `Invalid attack discovery verdict attachment data for attachment ${attachment.id}`
        );
      }
      return { type: 'text' as const, value: formatVerdict(attachment.data) };
    },
  }),

  getAgentDescription: () =>
    `You have been provided with the false-positive / true-positive analysis verdict for ` +
    `the Attack Discovery under investigation. The verdict is one of: ` +
    `\`true_positive\` (the attack is real), \`false_positive\` (it is not), ` +
    `\`inconclusive\` (the evidence did not settle it), or \`failed\` (the analysis itself ` +
    `did not complete, so no classification was produced). It carries the summary the ` +
    `verdict was drawn from, and a rationale when the analysis produced one. Treat it as ` +
    `the conclusion about the attack, distinct from the evidence it was drawn from.`,
});
