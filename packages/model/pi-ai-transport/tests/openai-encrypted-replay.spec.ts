import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber, toOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import type { ReplayMeterInput } from '../src/input-meter.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { canonicalProjection, outputBlockDigest } from '../src/projection.ts'
import {
  at,
  certificate,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'

const tokenized = vi.hoisted(() => [] as string[])
vi.mock('js-tiktoken', async importOriginal => {
  const actual = await importOriginal<typeof import('js-tiktoken')>()
  return {
    ...actual,
    getEncoding(...args: Parameters<typeof actual.getEncoding>) {
      const encoder = actual.getEncoding(...args),
        encode = encoder.encode.bind(encoder)
      encoder.encode = (...values: Parameters<typeof encode>) => {
        tokenized.push(values[0])
        return encode(...values)
      }
      return encoder
    },
  }
})
const models = ['openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna']
const detail = {
  type: 'reasoning.encrypted',
  data: 'ENCRYPTED_NEVER_TOKENIZE',
  format: 'openai-responses-v1',
  id: 'rs-local',
  index: 0,
}
let cert: Awaited<ReturnType<typeof certificate>>
beforeAll(async () => {
  cert = await certificate()
})
afterAll(async () => cert.dispose())

describe.each(models)('%s complete encrypted output replay', model => {
  it('public TLS runs three rounds, estimates O once, preserves ciphertext and rejects unverifiable mappings', async () => {
    const definition = openaiDefinitions.find(item => item.modelId === model)!
    const meter = createOpenAiInputMeter(definition)
    const full = vi.fn(meter.measureFull)
    const replay = vi.fn(meter.measureReplay)
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          sse({
            model,
            provider: 'OpenAI',
            choices: [{ delta: { reasoning_details: [detail], content: 'visible answer' } }],
          }) +
            sse({
              choices: [{ delta: {}, finish_reason: 'stop' }],
              usage: {
                prompt_tokens: 400,
                completion_tokens: 18,
                completion_tokens_details: { reasoning_tokens: 11 },
                prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                cost: 0.000123,
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
      inputMeters: [{ ...meter, measureFull: full, measureReplay: replay }],
    })
    const profile = createOfficialProfileContent(definition, {
      providers: ['openai'],
      allowFallback: false,
      configuration: openaiConfiguration,
    })
    if ('rejected' in profile) throw Error(profile.rejected)
    let next: PlanInput = {
      ...input(),
      routeName: model,
      provider: 'openai',
      snapshot: {
        ...input().snapshot,
        ...definition.capabilities,
        adaptation: profile.ok.adaptation,
        providers: profile.ok.providers,
        allowFallback: profile.ok.allowFallback,
        updatedAt: at,
      },
      messages: [message('user', 'STABLE_PREFIX_MARKER', 'u1')],
      tools: [],
      parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      tokenMargin: { multiplier: 1.1, reserveTokens: 7 },
    }
    try {
      for (let round = 1; round <= 3; round++) {
        tokenized.length = 0
        const beforeFull = full.mock.calls.length
        const plan = transport.plan(next)
        if ('rejected' in plan) throw Error(JSON.stringify(plan))
        const m = plan.planned.measurement
        expect(m.mode).toBe(round === 1 ? 'full' : 'marginal')
        if (m.mode === 'marginal') {
          expect(m.replayContribution).toEqual({ precision: 'estimated', tokens: 18 })
          expect(ExactDecimal.from(m.predictedInput).toString()).toBe(
            ExactDecimal.from(418).add(ExactDecimal.from(m.newContribution.tokens)).toString(),
          )
          expect(m.precision).toBe('estimated')
          expect(m.admissionTokens).toBe(
            Math.ceil(Number(ExactDecimal.from(m.predictedInput).toString()) * 1.1) + 7,
          )
        }
        const result = await invokeModel({
          ...next,
          transport,
          credential: 'local-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in result) || result.outcome !== 'complete')
          throw Error(JSON.stringify(result))
        expect(result.usage).toMatchObject({ output_tokens: 18, reasoning_tokens: 11 })
        expect(writeJsonLossless(result.cost.cost_usd)).toBe('0.000123')
        if (round > 1) {
          expect(full.mock.calls.length).toBe(beforeFull)
          expect(
            tokenized.some(
              text => text.includes('STABLE_PREFIX_MARKER') || text.includes(detail.data),
            ),
          ).toBe(false)
          expect(host.requests.at(-1)?.body).toContain(detail.data)
        }
        const target = next.messages.length
        next = {
          ...next,
          messages: [
            ...next.messages,
            judgedMessage({
              type: 'assistant',
              id: `a${round}`,
              response: `r${round}`,
              ending: 'complete',
              createdAt: at,
              blocks: result.blocks,
            }),
            message('user', `next ${round}`, `u${round + 1}`),
          ],
          calibration: {
            kind: 'observation',
            inputCalibration: result.inputCalibration,
            usage: result.usage,
            outputBlocks: result.blocks,
            replaySelection: result.blocks.map((_, i) => ({
              sourceBlockIndex: i,
              messageIndex: target,
              blockIndex: i,
            })),
          },
        }
      }
      expect(host.requests).toHaveLength(3)
      const noNew = transport.plan({ ...next, messages: next.messages.slice(0, -1) })
      if ('rejected' in noNew) throw Error(JSON.stringify(noNew))
      expect(noNew.planned.measurement).toMatchObject({
        mode: 'marginal',
        newContribution: { precision: 'exact', tokens: 0 },
        replayContribution: { precision: 'estimated', tokens: 18 },
      })
      const actual = replay.mock.calls.at(-1)?.[0]
      if (!actual) throw Error('missing actual replay input')
      expect(meter.measureReplay(actual)).toEqual({ kind: 'estimated', tokens: 18 })
      const group = actual.observation.inputCalibration.outputGroup
      if (group.kind !== 'known') throw Error('known group required')
      const reject = (value: ReplayMeterInput) =>
        expect(meter.measureReplay(value)).toEqual({ kind: 'unavailable' })
      const selection = actual.observation.replaySelection
      // Selection metadata order is irrelevant; the actual target order is authoritative.
      expect(
        meter.measureReplay({
          ...actual,
          observation: { ...actual.observation, replaySelection: [...selection].reverse() },
        }),
      ).toEqual({ kind: 'estimated', tokens: 18 })
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          inputCalibration: {
            ...actual.observation.inputCalibration,
            outputGroup: { ...group, completeness: 'partial' },
          },
        },
      })
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          inputCalibration: {
            ...actual.observation.inputCalibration,
            outputGroup: { ...group, source: 'delivered' },
          },
        },
      })
      reject({
        ...actual,
        observation: { ...actual.observation, replaySelection: selection.slice(0, 1) },
      })
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          replaySelection: selection.map((item, i) => ({
            ...item,
            sourceBlockIndex: selection.length - 1 - i,
          })),
        },
      })
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          replaySelection: selection.map(item => ({
            ...item,
            blockIndex: selection[0]!.blockIndex,
          })),
        },
      })
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          replaySelection: selection.map((item, i) => ({
            ...item,
            messageIndex: item.messageIndex + i,
          })),
        },
      })
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          replaySelection: [...selection, { ...selection[0]!, messageIndex: 999 }],
        },
      })
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          usage: { ...actual.observation.usage, output_tokens: 'unknown' },
        },
      })
      reject({
        ...actual,
        envelope: { ...actual.envelope, reasoning: { effort: 'low', context: 'current_turn' } },
      })
      reject({
        ...actual,
        envelope: { ...actual.envelope, reasoning: { effort: 'low', mode: 'pro' } },
      })
      reject({
        ...actual,
        envelope: {
          ...actual.envelope,
          provider: { order: ['other'], allow_fallbacks: false, require_parameters: true },
        },
      })
      reject({
        ...actual,
        units: [{ role: 'assistant', content: 'mutated', reasoning_details: [detail] }],
      })
      reject({ ...actual, unitIndices: [0] })
      reject({
        ...actual,
        selectionSpans: actual.selectionSpans.map(s => ({ ...s, end: s.end + 1 })),
      })
      reject({ ...actual, units: [...actual.units, ...actual.units], unitIndices: [100, 101] })
      const many = new LosslessNumber('9007199254740993')
      expect(
        writeJsonLossless(
          meter.measureReplay({
            ...actual,
            observation: {
              ...actual.observation,
              usage: { ...actual.observation.usage, output_tokens: many },
            },
          }),
        ),
      ).toBe('{"kind":"estimated","tokens":9007199254740993}')
      const alteredBlocks = actual.observation.outputBlocks.map(block =>
        block.kind === 'thinking'
          ? {
              ...block,
              opaque: toOpaqueJson({
                routeName: model,
                reasoning_details: [{ ...detail, format: 'unknown' }],
              }),
            }
          : block,
      )
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          outputBlocks: alteredBlocks,
          inputCalibration: {
            ...actual.observation.inputCalibration,
            outputGroup: { ...group, blockDigests: alteredBlocks.map(outputBlockDigest) },
          },
        },
      })
      for (const candidate of [
        { ...next, calibration: { kind: 'none', reason: 'no_observation' } as const },
        { ...next, messages: [message('user', 'changed P', 'u1'), ...next.messages.slice(1)] },
        { ...next, parameters: { ...next.parameters, reasoningEffort: 'high' as const } },
      ])
        expect(transport.plan(candidate)).toMatchObject({
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
        })
      const old = { ...meter, replayRevision: 'old-replay' }
      const switched = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [old],
      })
      try {
        expect(switched.plan(next)).toMatchObject({
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
        })
      } finally {
        await switched.close()
      }
      expect(() =>
        createOpenAiInputMeter({
          ...definition,
          revision: '4',
          implementation: { name: 'pi-ai:openai', revision: 'mp4-5' },
        }),
      ).toThrow('unsupported OpenAI')
      for (const proId of [
        'openai/gpt-5.6-sol-pro',
        'openai/gpt-5.6-terra-pro',
        'openai/gpt-5.6-luna-pro',
      ]) {
        const pro = openaiDefinitions.find(d => d.modelId === proId)!
        expect(createOpenAiInputMeter(pro).measureReplay(actual)).toEqual({ kind: 'unavailable' })
      }
      const observed = actual.observation.inputCalibration.observedInput
      if (observed.kind === 'unavailable') throw Error('known observation required')
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          inputCalibration: {
            ...actual.observation.inputCalibration,
            observedInput: {
              ...observed,
              provenance: { ...observed.provenance, servingProvider: 'Azure' },
            },
          },
        },
      })
      reject({
        ...actual,
        observation: {
          ...actual.observation,
          inputCalibration: {
            ...actual.observation.inputCalibration,
            observedInput: { kind: 'unavailable', reason: 'response_cache' },
          },
        },
      })
      const extraOpaque = judgedMessage({
        type: 'assistant',
        id: 'unselected-opaque',
        response: 'unselected-response',
        ending: 'complete',
        createdAt: at,
        blocks: actual.observation.outputBlocks,
      })
      expect(transport.plan({ ...next, messages: [...next.messages, extraOpaque] })).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
      })
      if (next.calibration.kind !== 'observation') throw Error('observation required')
      const nextGroup = next.calibration.inputCalibration.outputGroup
      if (nextGroup.kind !== 'known') throw Error('known output group required')
      const partial = {
        ...next,
        calibration: {
          ...next.calibration,
          inputCalibration: {
            ...next.calibration.inputCalibration,
            outputGroup: { ...nextGroup, completeness: 'partial' as const },
          },
        },
      }
      const denied = await invokeModel({
        ...partial,
        transport,
        credential: 'local-only',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      expect(denied).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
      const before = canonicalProjection(next)
      expect(
        transport.plan({ ...next, tokenMargin: { multiplier: 1, reserveTokens: 1000000 } }),
      ).toMatchObject({ rejected: 'invalidInput', reason: 'input_limit_exceeded' })
      expect(canonicalProjection(next)).toBe(before)
      expect(host.requests).toHaveLength(3)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
