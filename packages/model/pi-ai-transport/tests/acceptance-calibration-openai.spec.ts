import { imagePreparation } from './image-transport-support.ts'
import { describe, expect, it } from 'vitest'
import {invokeModel} from '@omne-harness-lite/model-request-runtime-local'
import {type PlanInput} from '@omne-harness-lite/model-request-runtime'
import {
  openaiDefinitions,
  createOpenAiInputMeter,
  createOfficialProfileContent,
  createPiAiTransport,
} from '../src/index.ts'
import {
  certificate,
  fixture,
  input,
  message,
  judgedMessage,
  policy,
  content,
  sse,
  finish,
  at,
} from './support.ts'

describe('independent known OpenAI display name calibration boundary', () => {
  it.each(['openai/gpt-5.6-sol', 'openai/gpt-6-sol'])(
    '%s uses actual OpenAI provenance while rejecting a different known serving provider',
    async model => {
      const definition = openaiDefinitions.find(d => d.modelId === model)!
      const meter = createOpenAiInputMeter(definition)
      const profile = createOfficialProfileContent(definition, {
        providers: ['openai'],
        allowFallback: false,
        configuration: { revision: 'independent-openai', values: { cache: { mode: 'automatic' } } },
      })
      if ('rejected' in profile) throw Error(profile.rejected)
      const cert = certificate()
      const host = await fixture(
        cert.tls,
        response =>
          response.end(
            content('known OpenAI reply') +
              sse({
                choices: [],
                model: definition.modelId,
                provider: 'OpenAI',
                usage: {
                  prompt_tokens: 400,
                  completion_tokens: 4,
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          ),
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [meter],
      })
      try {
        const first: PlanInput = {
          ...input(),
          routeName: definition.modelId,
          provider: 'openai',
          parameters: { maxOutputTokens: 128 },
          snapshot: {
            ...input().snapshot,
            ...definition.capabilities,
            adaptation: profile.ok.adaptation,
            providers: ['openai'],
          },
        }
        const outcome = await invokeModel({
          ...first,
          transport,
          credential: 'controlled-openai-key',
          signal: new AbortController().signal,
          policy: policy(),
          onAccepted() {},
        }).outcome
        if (!('outcome' in outcome) || outcome.outcome !== 'complete')
          throw Error(JSON.stringify(outcome))
        const observed = outcome.inputCalibration.observedInput
        if (observed.kind === 'unavailable') throw Error('known fixture observation unavailable')
        expect(observed.provenance.servingProvider).toBe('OpenAI')
        const reply = judgedMessage({
          type: 'assistant',
          id: 'openai-reply',
          response: 'openai-response',
          ending: 'complete',
          createdAt: at,
          blocks: outcome.blocks,
        })
        const next: PlanInput = {
          ...first,
          messages: [...first.messages, reply, message('user', 'next OpenAI turn', 'next')],
          calibration: {
            kind: 'observation',
            inputCalibration: outcome.inputCalibration,
            usage: outcome.usage,
            outputBlocks: outcome.blocks,
            replaySelection: outcome.blocks.map((_b, i) => ({
              sourceBlockIndex: i,
              messageIndex: first.messages.length,
              blockIndex: i,
            })),
          },
        }
        const planned = await transport.plan(next, { signal: new AbortController().signal })
        if (!('planned' in planned)) throw Error(JSON.stringify(planned))
        expect(planned.planned.measurement.mode).toBe('marginal')
        if (next.calibration.kind !== 'observation') throw Error('observation missing')
        const wrong = await transport.plan(
          {
            ...next,
            calibration: {
              ...next.calibration,
              inputCalibration: {
                ...outcome.inputCalibration,
                observedInput: {
                  ...observed,
                  provenance: { ...observed.provenance, servingProvider: 'OtherVendor' },
                },
              },
            },
          },
          { signal: new AbortController().signal },
        )
        if (!('planned' in wrong)) throw Error(JSON.stringify(wrong))
        expect(wrong.planned.measurement).toMatchObject({
          mode: 'full',
          fallbackReason: 'basis_changed',
        })
        expect(host.requests).toHaveLength(1)
      } finally {
        await transport.close()
        await host.close()
        cert.dispose()
      }
    },
  )
})
