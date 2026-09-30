import { testImagePreparerFor } from './image-transport-support.ts'
import { describe, expect, it } from 'vitest'
import { toOpaqueJson, writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOfficialProfileContent } from '../src/configuration.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import type { InputMeter } from '../src/input-meter.ts'
import { createGlm52InputMeter } from '../src/input-meters/zai-glm52.ts'
import { createGlm53InputMeter } from '../src/input-meters/zai-glm53.ts'
import { zaiDefinitions } from '../src/official-models/zai.ts'
import { planRequest } from '../src/plan.ts'

const at = '2026-09-28T00:00:00Z'
const modelIds = ['z-ai/glm-5.2', 'z-ai/glm-5.3', 'z-ai/glm-5.3-flash'] as const

function judged(raw: unknown): Message {
  const result = judgeMessage(raw)
  if ('rejected' in result) throw new Error(result.rejected)
  return result.ok
}

function definition(modelId: string): ModelDefinition {
  const selected = zaiDefinitions.find(item => item.modelId === modelId)
  if (!selected) throw new Error(`missing official definition: ${modelId}`)
  return selected
}

function input(model: ModelDefinition, opaque: boolean): PlanInput {
  const provider = 'z-ai/fp8'
  const profile = createOfficialProfileContent(model, {
    providers: [provider],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const thinking = 'Consider the exact arithmetic before answering.'
  const assistant = judged({
    type: 'assistant',
    id: 'previous-assistant',
    response: 'previous-response',
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        id: 'reasoning',
        kind: 'thinking',
        text: thinking,
        ...(opaque
          ? {
              opaque: toOpaqueJson({
                routeName: model.modelId,
                reasoning_details: [{ type: 'reasoning.text', text: thinking, index: 0 }],
              }),
            }
          : {}),
        visibility: { toHuman: false, toModel: true },
      },
      {
        id: 'answer',
        kind: 'text',
        text: 'The answer is 42.',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  const reminder = judged({
    type: 'system_reminder',
    id: 'reminder',
    createdAt: at,
    nature: 'event',
    source: { kind: 'attempt_started', attempt: 1, reason: 'first', at },
    blocks: [
      {
        id: 'reminder-text',
        kind: 'text',
        text: 'Keep the earlier answer in context.',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  const user = judged({
    type: 'user',
    id: 'follow-up',
    createdAt: at,
    blocks: [
      {
        id: 'question',
        kind: 'text',
        text: 'What was the answer?',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  return {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('zai-history-oracle', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: model.modelId,
    provider,
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
      updatedAt: at,
    },
    parameters: { maxOutputTokens: 64 },
    messages: [assistant, reminder, user],
    tools: [],
  }
}

function meter(model: ModelDefinition): InputMeter {
  return model.modelId === 'z-ai/glm-5.2'
    ? createGlm52InputMeter(model)
    : createGlm53InputMeter(model)
}

describe('Z.AI complete historical reasoning at the public planning boundary', () => {
  it.each(
    modelIds.flatMap(modelId => [
      { modelId, opaque: false },
      { modelId, opaque: true },
    ]),
  )(
    '$modelId opaque=$opaque retains history; only a released plain string is estimated',
    async ({ modelId, opaque }) => {
      const model = definition(modelId)
      const actual = meter(model)
      let finalBody: JsonObject | undefined
      const observing: InputMeter = {
        ...actual,
        measureFull(request) {
          finalBody = request.body
          expect(request.serialized).toBe(writeJsonLossless(request.body))
          return actual.measureFull(request)
        },
      }
      const result = await planRequest(
        input(model, opaque),
        [model],
        observing,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      // GLM-5.2 is released at mp4-18 (visible history); GLM-5.3 and Flash keep refusing
      // until ZV0. This hand-built detail lacks the captured `format` key: always refused.
      if (modelId === 'z-ai/glm-5.2' && !opaque) {
        expect(model.implementation.revision).toBe('mp4-18')
        expect(result).toMatchObject({
          planned: { measurement: { mode: 'full', precision: 'estimated' } },
        })
      } else
        expect(result).toEqual({
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
          metrics: ['maxInputTokens'],
        })
      expect(finalBody?.messages).toMatchObject([
        {
          role: 'assistant',
          content: 'The answer is 42.',
          ...(opaque
            ? {
                reasoning_details: [
                  {
                    type: 'reasoning.text',
                    text: 'Consider the exact arithmetic before answering.',
                    index: 0,
                  },
                ],
              }
            : { reasoning: 'Consider the exact arithmetic before answering.' }),
        },
        {
          role: 'user',
          content: [
            { text: '[system_reminder "reminder"]' },
            { text: 'Keep the earlier answer in context.' },
          ],
        },
        { role: 'user', content: [{ text: 'What was the answer?' }] },
      ])
    },
  )
})
