import { readFileSync } from 'node:fs'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type {PlanInput} from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import {createOfficialProfileContent} from '@omne-harness-lite/pi-ai-transport'
import {type ModelDefinition} from '@omne-harness-lite/model-request-runtime'
import { googleDefinitions } from '../../../src/official-models/google.ts'
import { judgedMessage, message } from '../../support.ts'

export const googleCertificationAt = '2026-09-28T00:00:00Z'
export const googleCertificationProvider = 'google-ai-studio'
export const googleCertificationVisibility = { toHuman: true, toModel: true }
// Valid, checksum-tested test material. This does not expand the production
// Google meter's finite media scope or establish provider acceptance.
const tinyPng = readFileSync(new URL('../moonshot/valid-red-1x1.png', import.meta.url)).toString(
  'base64',
)
export const googleCertificationTool: ModelToolEntry = {
  name: 'lookup__google',
  description: 'Look up a value',
  parameters: {
    type: 'object',
    properties: { key: { type: 'string' } },
    required: ['key'],
    additionalProperties: false,
  },
}

/**
 * Official-binding input case; callers still need a real route-applicable meter. A caller may
 * supply a declaration of the same model at other binding coordinates (the unpinned V4 row).
 */
export function googleCertificationRequest(modelId: string, declared?: ModelDefinition): PlanInput {
  if (declared !== undefined && declared.modelId !== modelId)
    throw new TypeError('declaration is for another model')
  const definition = declared ?? googleDefinitions.find(candidate => candidate.modelId === modelId)
  if (!definition) throw new TypeError(`Google model is not in the selected catalog: ${modelId}`)
  const profile = createOfficialProfileContent(definition, {
    providers: [googleCertificationProvider],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    calibration: { kind: 'none', reason: 'no_observation' },
    outputHistory: [],
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('google-wire-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider: googleCertificationProvider,
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: googleCertificationAt,
    },
    parameters: { reasoningEffort: 'medium', maxOutputTokens: 64 },
    messages: [
      message('system', 'instruction'),
      message('system_reminder', 'continue'),
      judgedMessage({
        id: 'google-assistant',
        type: 'assistant',
        response: 'google-response',
        ending: 'complete',
        createdAt: googleCertificationAt,
        blocks: [
          {
            id: 'google-thought',
            kind: 'thinking',
            text: 'consider lookup',
            visibility: googleCertificationVisibility,
          },
          {
            id: 'google-call',
            kind: 'tool_call',
            callId: 'google tool call',
            tool: googleCertificationTool.name,
            complete: true,
            arguments: { key: 'x' },
            visibility: googleCertificationVisibility,
          },
        ],
      }),
      judgedMessage({
        id: 'google-result',
        type: 'tool',
        callId: 'google tool call',
        createdAt: googleCertificationAt,
        blocks: [
          {
            id: 'google-result-block',
            kind: 'tool_result',
            callId: 'google tool call',
            outcome: 'completed',
            visibility: googleCertificationVisibility,
            blocks: [
              {
                id: 'google-result-text',
                kind: 'text',
                text: 'found',
                visibility: googleCertificationVisibility,
              },
            ],
          },
        ],
      }),
      judgedMessage({
        id: 'google-user-image',
        type: 'user',
        createdAt: googleCertificationAt,
        blocks: [
          {
            id: 'google-question',
            kind: 'text',
            text: 'describe',
            visibility: googleCertificationVisibility,
          },
          {
            id: 'google-image',
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: tinyPng },
            visibility: googleCertificationVisibility,
          },
        ],
      }),
    ],
    tools: [googleCertificationTool],
  }
}
