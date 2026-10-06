// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { planRequest } from '../src/plan.ts'
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
import { recordTiktokenInput } from './tokenizer-input.ts'

const tokenized = recordTiktokenInput()
const definition = openaiDefinitions.find(value => value.modelId === 'openai/gpt-6-luna')!
function request(): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  return {
    ...input(),
    routeName: definition.modelId,
    provider: 'openai',
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    messages: [
      message('system', 'Preserve the conversation.', 'sys'),
      message('system_reminder', 'Use the completed tool result.', 'reminder'),
      message('user', 'STABLE_PREFIX_MARKER ' + 'long history '.repeat(100), 'u1'),
      judgedMessage({
        type: 'assistant',
        id: 'tool-call-message',
        response: 'prior-tool-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'tool-call',
            kind: 'tool_call',
            callId: 'call-lookup',
            tool: 'lookup',
            arguments: { query: 'saved' },
            complete: true,
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
      judgedMessage({
        type: 'tool',
        id: 'tool-result-message',
        callId: 'call-lookup',
        createdAt: at,
        blocks: [
          {
            id: 'tool-result',
            kind: 'tool_result',
            callId: 'call-lookup',
            outcome: 'completed',
            visibility: { toHuman: true, toModel: true },
            blocks: [
              {
                id: 'tool-result-text',
                kind: 'text',
                text: 'saved value',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      }),
      message('user', 'Answer with the saved value.', 'after-tool'),
    ],
    tools: [
      {
        name: 'lookup',
        description: 'Look up saved values',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', enum: ['saved'] } },
          required: ['query'],
          additionalProperties: false,
        },
      },
    ],
    snapshot: {
      ...input().snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      updatedAt: at,
    },
    tokenMargin: { multiplier: new LosslessNumber('1.0000000000000000001'), reserveTokens: 7 },
  }
}
async function planned(value: PlanInput, meter = createOpenAiInputMeter(definition)) {
  const result = await planRequest(
    value,
    [definition],
    meter,
    {
      signal: new AbortController().signal,
    },
    testImagePreparerFor(planRequest),
  )
  if ('rejected' in result) throw Error(JSON.stringify(result))
  return result.planned
}

describe('Luna declared-effort official full/replay/new surrogate', () => {
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())

  it('binds the final-visible successor without an old revision alias', () => {
    expect(definition.revision).toBe('7')
    expect(createOpenAiInputMeter(definition)).toMatchObject({
      implementation: { revision: 'mp4-18' },
      algorithmRevision: 'openai-visible-json-complete-output-group-estimated/1',
      tokenizerRevision: 'js-tiktoken-1.0.21/o200k-base-gpt-6-luna-surrogate/1',
    })
  })

  it.each([undefined, 'none', 'low', 'medium', 'high', 'max'] as const)(
    'estimates actual final controls for effort %s, without defaults',
    async effort => {
      const value = await request()
      const parameters = {
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
        maxOutputTokens: 1024,
      }
      const p = await planned({ ...value, parameters })
      expect(p.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      expect(p.body.reasoning).toEqual(effort === undefined ? undefined : { effort })
      expect(tokenized).toContain(p.serialized)
      expect(
        ExactDecimal.from(p.measurement.admissionTokens).compare(
          ExactDecimal.from(p.measurement.predictedInput).add(ExactDecimal.from(8)),
        ),
      ).toBe(0)
      const atLimit = {
        ...value,
        parameters,
        snapshot: { ...value.snapshot, maxInputTokens: p.measurement.admissionTokens },
      }
      expect(
        await planRequest(
          atLimit,
          [definition],
          createOpenAiInputMeter(definition),
          {
            signal: new AbortController().signal,
          },
          testImagePreparerFor(planRequest),
        ),
      ).toHaveProperty('planned')
      const below = ExactDecimal.from(p.measurement.admissionTokens)
        .add(ExactDecimal.from(-1))
        .toJsonNumber()
      expect(
        await planRequest(
          { ...atLimit, snapshot: { ...atLimit.snapshot, maxInputTokens: below } },
          [definition],
          createOpenAiInputMeter(definition),
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        ),
      ).toMatchObject({
        rejected: 'invalidInput',
        basis: 'estimated',
        reason: 'input_limit_exceeded',
      })
    },
  )

  it.each([undefined, 'none', 'low', 'medium', 'high', 'max'] as const)(
    'effort %s: public TLS reanchors without tokenizing stable history and invalidates prefix/basis',
    async effort => {
      const meter = createOpenAiInputMeter(definition)
      const full = vi.fn(meter.measureFull)
      const bound = { ...meter, measureFull: full }
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            sse({
              model: definition.modelId,
              provider: 'OpenAI',
              choices: [{ delta: { content: 'visible answer' } }],
            }) +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 400,
                  completion_tokens: 2,
                  cost: 0.000123,
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
        inputMeters: [bound],
      })
      let next: PlanInput = {
        ...(await request()),
        parameters: {
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
          maxOutputTokens: 1024,
        },
      }
      try {
        for (let round = 1; round <= 3; round++) {
          tokenized.length = 0
          const count = full.mock.calls.length
          const p = await transport.plan(next, { signal: new AbortController().signal })
          if ('rejected' in p) throw Error(JSON.stringify(p))
          expect(p.planned.measurement.mode).toBe(round === 1 ? 'full' : 'marginal')
          const response = await invokeModel({
            ...next,
            transport,
            credential: 'local-test-key',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in response)) throw Error(JSON.stringify(response))
          expect(response.outcome).toBe('complete')
          expect(p.planned.body.reasoning).toEqual(effort === undefined ? undefined : { effort })
          expect(host.requests.at(-1)?.body).toBe(p.planned.serialized)
          expect(response.inputCalibration.observedInput.kind).toBe('from_usage')
          expect(writeJsonLossless(response.usage.input_tokens)).toBe('400')
          expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.000123')
          if (round > 1) {
            expect(full.mock.calls.length).toBe(count)
            expect(tokenized.some(value => value.includes('STABLE_PREFIX_MARKER'))).toBe(false)
            expect(tokenized.some(value => value.includes('visible answer'))).toBe(true)
            expect(tokenized.some(value => value.includes(`followup ${round}`))).toBe(true)
          }
          const assistantIndex = next.messages.length
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
                blocks: response.blocks,
              }),
              message('user', `followup ${round + 1}`, `u${round + 1}`),
            ],
            calibration: {
              kind: 'observation',
              inputCalibration: response.inputCalibration,
              usage: response.usage,
              outputBlocks: response.blocks,
              replaySelection: response.blocks.map((_block, index) => ({
                sourceBlockIndex: index,
                messageIndex: assistantIndex,
                blockIndex: index,
              })),
            },
          }
        }
        expect(host.requests).toHaveLength(3)
        expect(
          (
            await planned(
              { ...next, messages: [message('user', 'changed', 'u1'), ...next.messages.slice(1)] },
              bound,
            )
          ).measurement,
        ).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
        expect(
          (
            await planned(
              {
                ...next,
                tools: [
                  {
                    name: 'lookup',
                    description: 'new definition',
                    parameters: { type: 'object', properties: {} },
                  },
                ],
              },
              bound,
            )
          ).measurement,
        ).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
        expect(
          await planRequest(
            next,
            [definition],
            { ...bound, replayRevision: 'new-test-replay' },
            { signal: new AbortController().signal },
            testImagePreparerFor(planRequest),
          ),
        ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
        expect(
          (
            await planned(
              {
                ...next,
                parameters: {
                  reasoningEffort: effort === 'high' ? 'low' : 'high',
                  maxOutputTokens: 1024,
                },
              },
              bound,
            )
          ).measurement,
        ).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
        expect(
          await planRequest(
            next,
            [definition],
            { ...bound, definitionRevision: '1' },
            { signal: new AbortController().signal },
            testImagePreparerFor(planRequest),
          ),
        ).toEqual({
          rejected: 'unavailable',
        })
        if (next.calibration.kind !== 'observation') throw Error('missing source')
        const oldInput = next.calibration.inputCalibration.requestInput
        if (oldInput.kind !== 'known') throw Error('known request input required')
        const oldBasis = oldInput.countingBasis
        const oldCalibration: PlanInput = {
          ...next,
          calibration: {
            ...next.calibration,
            inputCalibration: {
              ...next.calibration.inputCalibration,
              requestInput: {
                ...oldInput,
                countingBasis: {
                  ...oldBasis,
                  binding: {
                    ...oldBasis.binding,
                    definition: { modelId: definition.modelId, revision: '3' },
                    implementation: { name: 'pi-ai:openai', revision: 'mp4-4' },
                  },
                  meterRevision:
                    'openai-gpt-6-luna-visible-history-json-o200k-1/response-calibration-1',
                  tokenizerRevision:
                    'tokenizer-basis/openai-gpt-6-luna-visible-history-json-o200k-1',
                },
              },
            },
          },
        }
        expect((await planned(oldCalibration, bound)).measurement).toMatchObject({
          mode: 'full',
          fallbackReason: 'basis_changed',
        })
        const sourceInputForReplay = next.calibration.inputCalibration.requestInput
        if (sourceInputForReplay.kind !== 'known') throw Error('known source input required')
        expect(
          (
            await planned(
              {
                ...next,
                calibration: {
                  ...next.calibration,
                  inputCalibration: {
                    ...next.calibration.inputCalibration,
                    requestInput: {
                      ...sourceInputForReplay,
                      countingBasis: {
                        ...sourceInputForReplay.countingBasis,
                        replayRevision: 'unlisted-original-replay',
                      },
                    },
                  },
                },
              },
              bound,
            )
          ).measurement,
        ).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
        const observation = next.calibration.inputCalibration.observedInput
        if (observation.kind === 'unavailable') throw Error('known source required')
        for (const changed of [
          { servingProvider: 'other' },
          { servingProvider: 'OPENAI' },
          { upstreamModel: 'openai/gpt-6-astra' },
        ]) {
          const wrongSource: PlanInput = {
            ...next,
            calibration: {
              ...next.calibration,
              inputCalibration: {
                ...next.calibration.inputCalibration,
                observedInput: {
                  ...observation,
                  provenance: { ...observation.provenance, ...changed },
                },
              },
            },
          }
          expect((await planned(wrongSource, bound)).measurement).toMatchObject({
            mode: 'full',
            fallbackReason: 'basis_changed',
          })
        }
        const forged = { ...next, calibration: { ...next.calibration, outputBlocks: [] } }
        expect(
          await planRequest(
            forged,
            [definition],
            bound,
            { signal: new AbortController().signal },
            testImagePreparerFor(planRequest),
          ),
        ).toMatchObject({
          rejected: 'invalidInput',
          reason: 'malformed',
        })
        expect(host.requests).toHaveLength(3)
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )
  it('rejects unsupported opaque/images and excess margin before public HTTP without deleting history', async () => {
    const meter = createOpenAiInputMeter(definition)
    const seen: string[] = []
    const host = await fixture(cert.tls, res => res.end(finish()), {}, undefined, [definition])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [
        {
          ...meter,
          measureFull(value) {
            seen.push(value.serialized)
            return meter.measureFull(value)
          },
        },
      ],
    })
    try {
      const original = await request()
      const opaque = judgedMessage({
        type: 'assistant',
        id: 'opaque-a',
        response: 'opaque-r',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'opaque',
            kind: 'thinking',
            text: '',
            opaque: {
              routeName: definition.modelId,
              reasoning_details: [
                { type: 'reasoning.encrypted', data: 'retained-opaque', index: 0 },
              ],
            },
            visibility: { toHuman: false, toModel: true },
          },
        ],
      })
      const visual = judgedMessage({
        type: 'user',
        id: 'image-user',
        createdAt: at,
        blocks: [
          {
            id: 'image',
            kind: 'image',
            mediaType: 'image/gif',
            data: {
              inline: readFileSync(
                new URL('./fixtures/openai-meter/two-frame.gif', import.meta.url),
              ).toString('base64'),
            },
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      for (const added of [opaque, visual]) {
        const value = { ...original, messages: [...original.messages, added] }
        const before = writeJsonLossless(value)
        const meterCalls = seen.length
        const result = await invokeModel({
          ...value,
          transport,
          credential: 'local',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        expect(result).toMatchObject({
          rejected: 'invalidInput',
          reason: added === opaque ? 'input_size_unavailable' : 'input_size_unavailable',
        })
        expect(writeJsonLossless(value)).toBe(before)
        if (added === opaque) expect(seen.at(-1)).toContain('retained-opaque')
        else expect(seen).toHaveLength(meterCalls)
      }
      const rejected = await invokeModel({
        ...original,
        tokenMargin: { multiplier: 1, reserveTokens: 1000000 },
        transport,
        credential: 'local',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      expect(rejected).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'estimated',
      })
      const single = await planned({
        ...original,
        messages: [message('user', 'single user', 'single')],
        tools: [],
        parameters: { reasoningEffort: 'none' },
      })
      expect(single.body.reasoning).toEqual({ effort: 'none' })
      expect(single.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      expect(() =>
        createOpenAiInputMeter({
          ...definition,
          revision: '3',
          implementation: { name: 'pi-ai:openai', revision: 'mp4-4' },
        }),
      ).toThrow('unsupported OpenAI')
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
