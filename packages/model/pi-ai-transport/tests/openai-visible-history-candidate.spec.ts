import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import { invokeModel } from '@omne-harness-lite/model-request-runtime'
import { createOfficialProfileContent } from '../src/configuration.ts'
import {
  createOpenAiInputMeter,
  createOpenAiVisibleHistoryCandidateMeter,
} from '../src/input-meters/openai.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { object, strictObject } from '../src/json.ts'
import { planRequest } from '../src/plan.ts'
import { createPiAiTransport } from '../src/transport.ts'
import {
  certificate,
  content,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'
import packet from './fixtures/openai/visible-history-candidate-cases.json' with { type: 'json' }
import observations from './fixtures/openai/luna-visible-history-observations.json' with { type: 'json' }

const visibility = { toHuman: true, toModel: true }
const at = '2026-09-28T00:00:00Z'

function definition(modelId: string) {
  const selected = openaiDefinitions.find(d => d.modelId === modelId)
  if (!selected) throw new Error(`missing ${modelId}`)
  return selected
}

function historyMeter(modelId: string) {
  const selected = definition(modelId)
  return modelId === 'openai/gpt-6-luna'
    ? createOpenAiInputMeter(selected)
    : createOpenAiVisibleHistoryCandidateMeter(selected)
}

function finalBody(c: (typeof packet.cases)[number]): JsonObject {
  if (createHash('sha256').update(c.wire).digest('hex') !== c.requestSha256)
    throw new Error(`frozen request changed: ${c.id}`)
  const body = strictObject(c.wire)
  if (!body) throw new Error(`invalid request: ${c.id}`)
  return body
}

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

function request(c: (typeof packet.cases)[number]): PlanInput {
  const selected = definition(c.modelId)
  const profile = createOfficialProfileContent(selected, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const body = finalBody(c)
  if (!object(body.reasoning) || body.reasoning.effort !== 'low')
    throw new Error('frozen effort changed')
  if (typeof body.max_tokens !== 'number') throw new Error('frozen output limit changed')
  return {
    ...input(),
    routeName: c.modelId,
    provider: 'openai',
    tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
    parameters: { reasoningEffort: 'low', maxOutputTokens: body.max_tokens },
    messages: sourceMessages(body),
    tools: sourceTools(body),
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
  }
}

describe('OpenAI visible-history Sol candidate and official Luna meter', () => {
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())

  it.each(observations.cases)(
    '$id keeps the live Luna observation attached to its frozen request',
    observed => {
      const frozen = packet.cases.find(value => value.id === observed.id)
      if (!frozen) throw new Error(`missing frozen request: ${observed.id}`)
      expect(frozen.modelId).toBe('openai/gpt-6-luna')
      expect(frozen.requestSha256).toBe(observed.requestSha256)
      expect(observed.estimatedInputTokens).toBe(frozen.expectedTokens)
      expect(observed.estimatedInputTokens - observed.upstreamInputTokens).toBe(
        observed.overestimateTokens,
      )
      expect(observations.route).toBe('openai')
      expect(observations.datedModel).toBe('openai/gpt-6-luna-20260922')
      expect(observed.generationId).toMatch(/^gen-/u)
      expect(
        historyMeter(frozen.modelId).measure({ body: finalBody(frozen), serialized: frozen.wire }),
      ).toEqual({ kind: 'estimated', tokens: observed.estimatedInputTokens })
    },
  )

  it.each(packet.cases)(
    '$id preserves the final planner body and counts every visible field',
    c => {
      const selected = definition(c.modelId)
      const meter = historyMeter(c.modelId)
      const body = finalBody(c)
      expect(meter.measure({ body, serialized: c.wire })).toEqual({
        kind: 'estimated',
        tokens: c.expectedTokens,
      })
      const result = planRequest(request(c), [selected], meter)
      if ('rejected' in result) throw new Error(JSON.stringify(result))
      expect(result.planned.serialized).toBe(c.wire)
      expect(result.planned.inputLimitEvidence).toMatchObject({
        inputTokens: { kind: 'estimated', tokens: c.expectedTokens },
        tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
        admissionTokens: Math.ceil((c.expectedTokens * 11) / 10) + 64,
      })
      expect(
        planRequest(
          {
            ...request(c),
            snapshot: { ...request(c).snapshot, maxInputTokens: c.expectedTokens },
          },
          [selected],
          meter,
        ),
      ).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'estimated',
        estimatedTokens: c.expectedTokens,
        admissionTokens: Math.ceil((c.expectedTokens * 11) / 10) + 64,
      })
    },
  )

  it('sends all six frozen plans over local TLS, retaining tool and reminder payloads', async () => {
    const selected = ['openai/gpt-6-sol', 'openai/gpt-6-luna'].map(definition)
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          content('done') +
            sse({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 2 } }) +
            finish(),
        ),
      {},
      undefined,
      selected,
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: selected,
      inputMeters: selected.map(value => historyMeter(value.modelId)),
    })
    try {
      for (const c of packet.cases) {
        const planned = transport.plan(request(c))
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.serialized).toBe(c.wire)
        const signal = new AbortController().signal
        const sent = await transport.send(planned.planned, 'controlled-local-credential', signal)
        if (!('response' in sent)) throw new Error(JSON.stringify(sent))
        const events = []
        for await (const event of transport.read(sent.response, planned.planned, signal))
          events.push(event)
        expect(events).toContainEqual(expect.objectContaining({ t: 'account' }))
        expect(host.requests.at(-1)?.body).toBe(c.wire)
      }
      expect(host.requests).toHaveLength(6)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('invokes Luna official history through the public function with one TLS send and one content gate', async () => {
    const c = packet.cases.find(value => value.id === 'luna-tool-reminder-holdout')
    if (!c) throw new Error('missing Luna holdout')
    const selected = definition(c.modelId)
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          sse({
            id: 'gen-local-luna-history',
            model: 'openai/gpt-6-luna-20260922',
            provider: 'OpenAI',
            choices: [{ delta: { content: 'ALPHA' } }],
          }) +
            sse({ choices: [], usage: { prompt_tokens: 236, completion_tokens: 2 } }) +
            finish(),
        ),
      {},
      undefined,
      [selected],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [selected],
      inputMeters: [createOpenAiInputMeter(selected)],
    })
    try {
      const requested = request(c)
      const planned = transport.plan(requested)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.serialized).toBe(c.wire)
      expect(planned.planned.serialized).toContain('"max_tokens":64')
      expect(planned.planned.inputLimitEvidence.inputTokens).toEqual({
        kind: 'estimated',
        tokens: 410,
      })
      let contentGates = 0
      const accepted: string[] = []
      const result = await invokeModel({
        ...requested,
        transport,
        credential: 'controlled-local-credential',
        signal: new AbortController().signal,
        policy: policy(),
        beforeFirstContent: async () => {
          contentGates++
        },
        onAccepted: event => {
          accepted.push(event.t)
        },
      }).outcome
      if (!('outcome' in result)) throw new Error(JSON.stringify(result))
      expect(result.outcome).toBe('complete')
      expect(result.blocks).toMatchObject([{ kind: 'text', text: 'ALPHA' }])
      expect(result.servingProvider).toBe('OpenAI')
      expect(contentGates).toBe(1)
      expect(accepted.filter(type => type === 'fill')).toHaveLength(1)
      expect(accepted.filter(type => type === 'account')).toHaveLength(1)
      expect(accepted.filter(type => type === 'finish')).toHaveLength(1)
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(c.wire)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('rejects opaque, media, unknown fields and inconsistent wire without trimming history', () => {
    const c = packet.cases.find(value => value.id === 'luna-paired-tool-history')
    if (!c) throw new Error('missing tool case')
    const body = finalBody(c)
    const meter = historyMeter(c.modelId)
    const changed = (value: JsonObject) =>
      meter.measure({ body: value, serialized: writeJsonLossless(value) })
    expect(meter.measure({ body, serialized: `${c.wire} ` })).toEqual({ kind: 'unavailable' })
    expect(changed({ ...body, opaqueControl: true })).toEqual({ kind: 'unavailable' })
    expect(changed({ ...body, reasoning: { effort: 'high' } })).toEqual({ kind: 'unavailable' })
    expect(
      changed({
        ...body,
        provider: { order: ['other'], allow_fallbacks: false, require_parameters: true },
      }),
    ).toEqual({ kind: 'unavailable' })
    if (!Array.isArray(body.messages)) throw new Error('missing messages')
    const assistant = body.messages.find(value => object(value) && value.role === 'assistant')
    if (!object(assistant)) throw new Error('missing assistant')
    expect(
      changed({
        ...body,
        messages: body.messages.map(value =>
          value === assistant
            ? { ...assistant, reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque' }] }
            : value,
        ),
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(
      changed({
        ...body,
        messages: [
          ...body.messages,
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
          },
        ],
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(
      changed({
        ...body,
        tools: [
          {
            type: 'function',
            function: { name: 'lookup', description: '', parameters: {} },
            unknown: true,
          },
        ],
      }),
    ).toEqual({ kind: 'unavailable' })
    const alteredHistory = {
      ...body,
      messages: [
        ...body.messages,
        { role: 'user', content: [{ type: 'text', text: 'different '.repeat(120) }] },
      ],
    }
    expect(changed(alteredHistory)).toMatchObject({ kind: 'estimated' })
    expect(changed(alteredHistory)).not.toEqual(changed(body))
    const alteredResult = {
      ...body,
      messages: body.messages.map(value =>
        object(value) && value.role === 'tool'
          ? { ...value, content: `${value.content} ${'result '.repeat(120)}` }
          : value,
      ),
    }
    expect(changed(alteredResult)).not.toEqual(changed(body))
    const alteredReminder = {
      ...body,
      messages: body.messages.map(value =>
        object(value) && value.role === 'developer' && Array.isArray(value.content)
          ? {
              ...value,
              content: [...value.content, { type: 'text', text: 'reminder '.repeat(120) }],
            }
          : value,
      ),
    }
    expect(changed(alteredReminder)).not.toEqual(changed(body))
    const alteredTools = {
      ...body,
      tools: [
        ...(Array.isArray(body.tools) ? body.tools : []),
        {
          type: 'function',
          function: {
            name: 'another',
            description: 'extra '.repeat(120),
            parameters: { type: 'object' },
          },
        },
      ],
    }
    expect(changed(alteredTools)).not.toEqual(changed(body))
    expect(planRequest(request(c), [definition(c.modelId)], meter)).toHaveProperty('planned')
    expect(() => createOpenAiVisibleHistoryCandidateMeter(definition(c.modelId))).toThrow(TypeError)
  })
})
