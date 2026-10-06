import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { googleCertificationRequest, googleCertificationTool } from './cases.ts'
import { judgedMessage, message } from '../../support.ts'

/** Four fixed shapes per exact model: two fit rows, then two sealed holdout rows. */
export const googleCalibrationCaseIds = ['F1', 'F2', 'H1', 'H2'] as const
export type GoogleCalibrationCaseId = (typeof googleCalibrationCaseIds)[number]
const nestedTool: ModelToolEntry = {
  name: 'lookup__nested',
  description: 'Look up a typed record',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'object',
        properties: { key: { type: 'string' }, limit: { type: 'integer' } },
        required: ['key'],
      },
    },
    required: ['query'],
  },
}

export function googleCalibrationRequest(modelId: string, id: GoogleCalibrationCaseId): PlanInput {
  const base = googleCertificationRequest(modelId)
  const common = {
    ...base,
    target: {
      kind: 'model_call',
      callId: unwrap(
        parseOpaqueIdentifier(`google-calibration-${id.toLowerCase()}`, 'ModelCallId'),
      ),
      dispatch: 1,
    },
    parameters: { maxOutputTokens: 32 },
  } satisfies PlanInput
  if (id === 'F1')
    return { ...common, messages: [message('user', 'Name one color.', 'google-f1')], tools: [] }
  if (id === 'F2')
    return {
      ...common,
      messages: [
        message('system', 'Answer with one short sentence.', 'google-f2-system'),
        message('system_reminder', 'Use the lookup result if needed.', 'google-f2-reminder'),
        message('user', 'What does the lookup key mean?', 'google-f2-user'),
      ],
      tools: [nestedTool],
    }
  if (id === 'H1')
    return {
      ...common,
      messages: [
        message('system', '只回答一句话。', 'google-h1-system'),
        message('user', '解释 `let café = 3` 的含义。', 'google-h1-user'),
      ],
      tools: [],
    }
  return {
    ...common,
    messages: [
      ...base.messages.filter(item => item.id !== 'google-user-image'),
      judgedMessage({
        id: 'google-h2-user',
        type: 'user',
        createdAt: '2026-09-28T00:00:00Z',
        blocks: [
          {
            id: 'google-h2-text',
            kind: 'text',
            text: 'Summarize the complete exchange in one sentence.',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
    ],
    tools: [googleCertificationTool],
  }
}
