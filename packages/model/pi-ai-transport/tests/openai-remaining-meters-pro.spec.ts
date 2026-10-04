// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { readFileSync } from 'node:fs'
import { getEncoding } from 'js-tiktoken'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  LosslessNumber,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime-local'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { openaiDefinitions, openaiConfiguration } from '../src/official-models/openai.ts'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { object, strictObject } from '../src/json.ts'
import { planRequest } from '../src/plan.ts'
import {
  at,
  certificate,
  fixture,
  input,
  judgedMessage,
  message,
  policy,
  sse,
  finish,
} from './support.ts'
import packet from './fixtures/openai-delivery/unbound-gpt6-cases.json' with { type: 'json' }
const visibility = { toHuman: true, toModel: true }
const models = ['openai/gpt-6-astra-pro', 'openai/gpt-6-sol-pro', 'openai/gpt-6-luna-pro']
const encoder = getEncoding('o200k_base')
function textParts(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('expected text parts')
  return value.map(part => {
    if (!object(part) || part.type !== 'text' || typeof part.text !== 'string')
      throw new Error('expected text part')
    return part.text
  })
}

function sourceMessages(body: JsonObject): PlanInput['messages'] {
  if (!Array.isArray(body.messages)) throw new Error('missing messages')
  return body.messages.map((raw, index) => {
    if (!object(raw)) throw new Error('invalid message')
    const id = `history-${index}`
    if (raw.role === 'developer') {
      const [marker, ...texts] = textParts(raw.content)
      const match = /^\[system_reminder (.+)\]$/u.exec(marker ?? '')
      if (!match?.[1]) throw new Error('invalid reminder marker')
      const reminderId: unknown = JSON.parse(match[1])
      if (typeof reminderId !== 'string') throw new Error('invalid reminder id')
      return message('system_reminder', texts.join(''), reminderId)
    }
    if (raw.role === 'system' || raw.role === 'user')
      return message(raw.role, textParts(raw.content).join(''), id)
    if (raw.role === 'assistant') {
      const blocks: unknown[] = []
      if (typeof raw.content !== 'string') throw new Error('invalid assistant content')
      if (raw.content)
        blocks.push({ id: `${id}-text`, kind: 'text', text: raw.content, visibility })
      if (raw.tool_calls !== undefined) {
        if (!Array.isArray(raw.tool_calls)) throw new Error('invalid tool calls')
        for (const [callIndex, call] of raw.tool_calls.entries()) {
          if (
            !object(call) ||
            typeof call.id !== 'string' ||
            !object(call.function) ||
            typeof call.function.name !== 'string' ||
            typeof call.function.arguments !== 'string'
          )
            throw new Error('invalid tool call')
          blocks.push({
            id: `${id}-call-${callIndex}`,
            kind: 'tool_call',
            callId: call.id,
            tool: call.function.name,
            arguments: JSON.parse(call.function.arguments),
            complete: true,
            visibility,
          })
        }
      }
      return judgedMessage({
        type: 'assistant',
        id,
        response: `response-${id}`,
        ending: 'complete',
        createdAt: at,
        blocks,
      })
    }
    if (raw.role === 'tool') {
      if (typeof raw.tool_call_id !== 'string' || typeof raw.content !== 'string')
        throw new Error('invalid tool result')
      return judgedMessage({
        type: 'tool',
        id,
        callId: raw.tool_call_id,
        createdAt: at,
        blocks: [
          {
            id: `${id}-result`,
            kind: 'tool_result',
            callId: raw.tool_call_id,
            outcome: 'completed',
            visibility,
            blocks: [{ id: `${id}-text`, kind: 'text', text: raw.content, visibility }],
          },
        ],
      })
    }
    throw new Error('unsupported frozen role')
  })
}

function sourceTools(body: JsonObject): PlanInput['tools'] {
  if (body.tools === undefined) return []
  if (!Array.isArray(body.tools)) throw new Error('invalid tools')
  return body.tools.map(raw => {
    if (!object(raw) || !object(raw.function)) throw new Error('invalid tool')
    const tool = raw.function
    if (
      typeof tool.name !== 'string' ||
      typeof tool.description !== 'string' ||
      !object(tool.parameters)
    )
      throw new Error('invalid tool fields')
    return { name: tool.name, description: tool.description, parameters: tool.parameters }
  })
}

function request(model: string): PlanInput {
  const definition = openaiDefinitions.find(value => value.modelId === model)!
  const profile = createOfficialProfileContent(definition, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  const frozen = packet.cases.find(c => c.modelId === model && c.set === 'holdout')!
  const body = strictObject(frozen.wire)!
  return {
    ...input(),
    routeName: model,
    provider: 'openai',
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    messages: sourceMessages(body),
    tools: sourceTools(body),
    snapshot: {
      ...input().snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: false,
    },
    tokenMargin: { multiplier: new LosslessNumber('1.0000000000000000001'), reserveTokens: 7 },
  }
}
describe.each(models)('remaining Pro final-visible meter: %s', model => {
  const definition = openaiDefinitions.find(value => value.modelId === model)!
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())
  it('supplies exact current binding and measures every declared effort/absence with one precise margin', async () => {
    const meter = createOpenAiInputMeter(definition)
    expect(meter).toMatchObject({
      modelId: model,
      definitionRevision: '6',
      implementation: {
        name: 'pi-ai:openai',
        revision: 'mp4-18',
      },
      transformRevision: 'openrouter-input-transform/pro-scope-1',
    })
    expect(meter.tokenizerRevision).toContain('surrogate')
    for (const revision of ['1', '2'])
      expect(() =>
        createOpenAiInputMeter({
          ...definition,
          revision,
          implementation: { name: 'pi-ai:openai', revision: revision === '1' ? 'mp4-1' : 'mp4-7' },
        }),
      ).toThrow('unsupported OpenAI')
    const efforts =
      model === 'openai/gpt-6-astra-pro'
        ? (['low', 'medium', 'high', 'max'] as const)
        : (['none', 'low', 'medium', 'high', 'max'] as const)
    for (const effort of [undefined, ...efforts]) {
      const value = {
        ...(await request(model)),
        parameters: {
          maxOutputTokens: 1024,
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
        },
      }
      const planned = await planRequest(
        value,
        [definition],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in planned) throw Error(JSON.stringify(planned))
      const p = planned.planned
      expect(p.body.reasoning).toEqual(effort === undefined ? undefined : { effort })
      expect(p.measurement).toMatchObject({
        mode: 'full',
        precision: 'estimated',
        predictedInput: encoder.encode(p.serialized).length,
      })
      expect(ExactDecimal.from(p.measurement.admissionTokens).toString()).toBe(
        ExactDecimal.from(p.measurement.predictedInput).add(ExactDecimal.from(8)).toString(),
      )
      expect(
        await planRequest(
          {
            ...value,
            snapshot: { ...value.snapshot, maxInputTokens: p.measurement.admissionTokens },
          },
          [definition],
          meter,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        ),
      ).toHaveProperty('planned')
      expect(
        await planRequest(
          {
            ...value,
            snapshot: {
              ...value.snapshot,
              maxInputTokens: ExactDecimal.from(p.measurement.admissionTokens)
                .add(ExactDecimal.from(-1))
                .toJsonNumber(),
            },
          },
          [definition],
          meter,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        ),
      ).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'estimated',
      })
    }
    const simple = await planRequest(
      { ...(await request(model)), messages: [message('user', 'single user')], tools: [] },
      [definition],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    expect(simple).toHaveProperty('planned')
    for (const frozen of packet.cases.filter(c => c.modelId === model)) {
      expect(frozen).not.toHaveProperty('actualTokens')
      const body = strictObject(frozen.wire)!
      expect(directFull(meter, { body, serialized: frozen.wire })).toEqual({
        kind: 'estimated',
        tokens: encoder.encode(frozen.wire).length,
      })
    }
  })
  it('sends full visible tools/reminders through public TLS, keeps Pro actual accounts without calibrating', async () => {
    const meter = createOpenAiInputMeter(definition),
      full = vi.fn(meter.measureFull),
      delta = vi.fn(meter.measureNew)
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          sse({ model, provider: 'OpenAI', choices: [{ delta: { content: 'answer' } }] }) +
            sse({
              choices: [],
              usage: {
                prompt_tokens: 1561,
                completion_tokens: 33,
                prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                cost: 0.001,
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
      inputMeters: [{ ...meter, measureFull: full, measureNew: delta }],
    })
    try {
      let next = await request(model)
      for (let turn = 0; turn < 3; turn++) {
        const count = full.mock.calls.length
        const result = await invokeModel({
          ...next,
          transport,
          credential: 'local',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in result)) throw Error(JSON.stringify(result))
        expect(result.outcome).toBe('complete')
        expect(full.mock.calls.length).toBe(count + 1)
        expect(delta).not.toHaveBeenCalled()
        expect(result.inputCalibration.observedInput).toEqual({
          kind: 'unavailable',
          reason: 'scope_unknown',
        })
        expect(writeJsonLossless(result.usage.input_tokens)).toBe('1561')
        expect(result.usage.output_tokens).toBe(33)
        expect(result.usage.source).toBe('upstream')
        expect(writeJsonLossless(result.cost.cost_usd)).toBe('0.001')
        const assistantIndex = next.messages.length
        next = {
          ...next,
          messages: [
            ...next.messages,
            judgedMessage({
              type: 'assistant',
              id: `a${turn}`,
              response: `r${turn}`,
              ending: 'complete',
              createdAt: at,
              blocks: result.blocks,
            }),
            message('user', `next ${turn}`, `u${turn}`),
          ],
          calibration: {
            kind: 'observation',
            inputCalibration: result.inputCalibration,
            usage: result.usage,
            outputBlocks: result.blocks,
            replaySelection: result.blocks.map((_b, i) => ({
              sourceBlockIndex: i,
              messageIndex: assistantIndex,
              blockIndex: i,
            })),
          },
        }
        const forged = {
          ...next,
          calibration: {
            ...next.calibration,
            inputCalibration: {
              ...result.inputCalibration,
              observedInput: {
                kind: 'from_usage' as const,
                provenance: {
                  adapterRevision: 'openrouter-usage-reader/3-openai-pro-scope',
                  fieldPaths: ['usage.prompt_tokens'] as [string],
                  upstreamModel: model,
                  servingProvider: 'OpenAI',
                },
              },
            },
          },
        }
        const planned = await transport.plan(forged, { signal: new AbortController().signal })
        if ('rejected' in planned) throw Error(JSON.stringify(planned))
        expect(planned.planned.measurement).toMatchObject({
          mode: 'full',
          fallbackReason: 'source_unavailable',
        })
      }
      expect(host.requests).toHaveLength(3)
      expect(full.mock.calls[0]?.[0].serialized).toContain('tool_call_id')
      expect(full.mock.calls[0]?.[0].serialized).toContain('保留完整工具历史')
      expect(full.mock.calls[0]?.[0].serialized).toContain('unused_status')
    } finally {
      await transport.close()
      await host.close()
    }
  })
  it('retains unsupported images/opaque and refuses them or excess admission reserve before HTTP', async () => {
    const meter = createOpenAiInputMeter(definition),
      seen: string[] = []
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
      const original = await request(model)
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
              routeName: model,
              reasoning_details: [
                { type: 'reasoning.encrypted', data: 'retained-opaque', index: 0 },
              ],
            },
            visibility: { toHuman: false, toModel: true },
          },
        ],
      })
      const image = judgedMessage({
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
            visibility,
          },
        ],
      })
      for (const added of [opaque, image]) {
        const value = { ...original, messages: [...original.messages, added] },
          before = writeJsonLossless(value)
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
      const result = await invokeModel({
        ...original,
        tokenMargin: { multiplier: 1, reserveTokens: 1000000 },
        transport,
        credential: 'local',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      expect(result).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'estimated',
      })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})

it('rejects inherited object keys as model bindings', () => {
  const definition = openaiDefinitions.find(value => value.modelId === 'openai/gpt-6-astra-pro')!
  for (const modelId of ['constructor', 'toString', '__proto__'])
    expect(() =>
      createOpenAiInputMeter({
        ...definition,
        modelId,
        revision: '4',
        implementation: { name: 'pi-ai:openai', revision: 'mp4-7' },
      }),
    ).toThrow('unsupported OpenAI')
})
