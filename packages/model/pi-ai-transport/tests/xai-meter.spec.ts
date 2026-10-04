import { imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  jsonNumberSource,
  toOpaqueJson,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  createOfficialProfileContent,
  createPiAiTransport,
} from '@omne-harness-lite/pi-ai-transport'
import { createXaiInputMeter } from '../src/input-meters/xai.ts'
import { createXaiHistoryCandidateInputMeter } from '../src/input-meters/xai-candidate.ts'
import { object } from '../src/json.ts'
import { xaiDefinitions } from '../src/official-models/xai.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import { certificate, content, finish, fixture, judgedMessage, policy } from './support.ts'

interface Golden {
  readonly modelId: string
  readonly scenario: string
  readonly body: JsonObject
  readonly wireSha256: string
  readonly requestBytes: number
  readonly totalPromptTokens: number
}
const rows: readonly Golden[] = [
  'grok46-text-calibration.json',
  'grok47-text-calibration.json',
].flatMap(name =>
  JSON.parse(readFileSync(new URL(`./fixtures/xai/${name}`, import.meta.url), 'utf8')),
)
const definition = xaiDefinitions.find(item => item.modelId === 'x-ai/grok-4.6')!
function requiredMeter(value: ModelDefinition) {
  const meter = createXaiInputMeter(value)
  if (!meter) throw new Error('missing bound meter')
  return meter
}
const meter = requiredMeter(definition)

describe('Grok limited visible text/tool estimates', () => {
  it.each(rows)(
    'keeps exact frozen $modelId/$scenario wire and independent complete prompt observation',
    row => {
      const meter = requiredMeter(xaiDefinitions.find(item => item.modelId === row.modelId)!)
      const serialized = writeJsonLossless(row.body)
      expect(Buffer.byteLength(serialized, 'utf8')).toBe(row.requestBytes)
      expect(createHash('sha256').update(serialized).digest('hex')).toBe(row.wireSha256)
      const expected =
        row.modelId === 'x-ai/grok-4.6'
          ? row.scenario === 'fit-short'
            ? 219
            : row.scenario === 'fit-multilingual'
              ? 241
              : 369
          : row.scenario === 'fit-short'
            ? 1274
            : row.scenario === 'fit-multilingual'
              ? 1298
              : 1426
      expect(directFull(meter, { body: row.body, serialized })).toEqual({
        kind: 'estimated',
        tokens: expected,
      })
      expect(expected - row.totalPromptTokens).toBe(
        row.scenario === 'fit-short'
          ? 0
          : row.scenario === 'fit-multilingual'
            ? 1
            : row.modelId === 'x-ai/grok-4.6'
              ? 35
              : 34,
      )
    },
  )
  it.each(xaiDefinitions)('$modelId binds only its exact current definition', definition => {
    expect(
      createXaiInputMeter({
        ...definition,
        implementation: { ...definition.implementation, revision: 'mp4-2' },
      }),
    ).toBeUndefined()
    expect(
      createXaiInputMeter({
        ...definition,
        capabilities: { ...definition.capabilities, maxInputTokens: 49999 },
      }),
    ).toBeUndefined()
  })
  it.each(xaiDefinitions)(
    '$modelId retains its frozen formula across declared efforts',
    definition => {
      const meter = requiredMeter(definition)
      const fixture = rows.find(
        row => row.modelId === definition.modelId && row.scenario === 'holdout-tool-history',
      )
      if (!fixture) throw new Error('missing full visible-history fixture')
      const offset = definition.modelId === 'x-ai/grok-4.6' ? 141 : 1181
      for (const effort of ['low', 'medium', 'high']) {
        const body = { ...fixture.body, reasoning: { effort } }
        const serialized = writeJsonLossless(body)
        expect(directFull(meter, { body, serialized })).toEqual({
          kind: 'estimated',
          tokens: Math.floor(Buffer.byteLength(serialized, 'utf8') / 4) + offset,
        })
      }
    },
  )
  it('handles actual JsonNumber bytes and refuses mismatched serialization', () => {
    const body = { ...rows[0]!.body, max_tokens: new LosslessNumber('128') }
    expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual({
      kind: 'estimated',
      tokens: 219,
    })
    expect(directFull(meter, { body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
  })
  it.each(xaiDefinitions)(
    '$modelId refuses opaque/media/unknown controls without removing historical input',
    definition => {
      const meter = requiredMeter(definition)
      const body = rows.find(
        row => row.modelId === definition.modelId && row.scenario === 'holdout-tool-history',
      )!.body
      const original = writeJsonLossless(body)
      const unsupported = [
        {
          ...body,
          messages: [
            ...(body.messages as readonly JsonObject[]),
            {
              role: 'assistant',
              content: 'prior',
              reasoning_details: [{ type: 'reasoning.encrypted', data: 'ciphertext' }],
            },
          ],
        },
        {
          ...body,
          messages: [
            ...(body.messages as readonly JsonObject[]),
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } }],
            },
          ],
        },
        {
          ...body,
          messages: [
            ...(body.messages as readonly JsonObject[]),
            {
              role: 'user',
              content: [{ type: 'input_audio', input_audio: { data: 'YQ==', format: 'wav' } }],
            },
          ],
        },
        { ...body, reasoning: { effort: 'none' } },
        { ...body, reasoning: { effort: 'max' } },
        { ...body, reasoning: {} },
        { ...body, reasoning: { effort: 1 } },
        { ...body, reasoning: { effort: 'low', extra: true } },
        { ...body, temperature: new LosslessNumber('0.5') },
        { ...body, tools: [{ type: 'web_search' }] },
      ]
      for (const input of unsupported)
        expect(directFull(meter, { body: input, serialized: writeJsonLossless(input) })).toEqual({
          kind: 'unavailable',
        })
      expect(writeJsonLossless(body)).toBe(original)
    },
  )
  it.each(
    xaiDefinitions.flatMap(definition =>
      (['low', 'medium', 'high'] as const).map(effort => ({
        definition,
        modelId: definition.modelId,
        effort,
      })),
    ),
  )(
    '$modelId $effort plans once and sends identical estimated bytes over local TLS',
    async ({ definition, effort }) => {
      const profile = createOfficialProfileContent(definition, {
        providers: ['xai'],
        allowFallback: false,
        configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      const input: PlanInput = {
        calibration: { kind: 'none' as const, reason: 'no_observation' as const },
        outputHistory: [],
        tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
        target: {
          kind: 'model_call',
          callId: unwrap(parseOpaqueIdentifier('xai-candidate-call', 'ModelCallId')),
          dispatch: 1,
        },
        routeName: definition.modelId,
        provider: 'xai',
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
          updatedAt: '2026-09-28T00:00:00Z',
        },
        parameters: { reasoningEffort: effort, maxOutputTokens: 128 },
        tools: [],
        messages: [
          judgedMessage({
            id: 'xai-candidate-user',
            type: 'user',
            createdAt: '2026-09-28T00:00:00Z',
            blocks: [
              {
                id: 'xai-candidate-text',
                kind: 'text',
                text: 'hello',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          }),
        ],
      }
      const cert = certificate()
      const host = await fixture(
        cert.tls,
        res => res.end(content('ok') + finish()),
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [requiredMeter(definition)],
      })
      try {
        const planned = await transport.plan(input, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(planned.rejected)
        expect(planned.planned.inputLimitEvidence).toMatchObject({
          inputTokens: { kind: 'estimated' },
          meterRevision: 'xai-visible-json-complete-output-group-estimated/1',
        })
        expect(planned.planned.body.reasoning).toEqual({ effort })
        const evidence = planned.planned.inputLimitEvidence
        if (evidence.inputTokens.kind !== 'estimated' || evidence.admissionTokens === undefined)
          throw new Error('expected estimate and admitted token count')
        expect(Number(jsonNumberSource(evidence.admissionTokens))).toBe(
          Math.ceil(Number(jsonNumberSource(evidence.inputTokens.tokens)) * 1.2) + 32,
        )
        const result = await invokeModel({
          ...input,
          transport,
          credential: 'local-test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        expect(result).toMatchObject({ outcome: 'complete' })
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
      } finally {
        await transport.close()
        await host.close()
        cert.dispose()
      }
    },
  )
})

interface HistoryGolden {
  readonly file: string
  readonly model: string
  readonly scenario: string
  readonly sourceFileSha256: string
  readonly finalWireSha256: string
  readonly detailsSha256: string
  readonly originalOutcomeSha256: string
  readonly nativeReasoningTokens: number
  readonly candidateEstimateTokens: number
}
const historyRows: readonly HistoryGolden[] = JSON.parse(
  readFileSync(new URL('./fixtures/xai/history/manifest.json', import.meta.url), 'utf8'),
)
const at = '2026-09-28T00:00:00Z'
const visible = { toHuman: true, toModel: true }
function historyBody(row: HistoryGolden): JsonObject {
  const source = readFileSync(new URL(`./fixtures/xai/history/${row.file}`, import.meta.url))
  expect(createHash('sha256').update(source).digest('hex')).toBe(row.sourceFileSha256)
  const body: unknown = JSON.parse(source.toString('utf8'))
  if (!object(body)) throw new Error('invalid frozen history body')
  expect(createHash('sha256').update(writeJsonLossless(body)).digest('hex')).toBe(
    row.finalWireSha256,
  )
  return body
}
function historyMessages(body: JsonObject, routeName: string): PlanInput['messages'] {
  if (!Array.isArray(body.messages)) throw new Error('missing frozen messages')
  return body.messages.map((raw, index) => {
    if (!object(raw)) throw new Error('invalid frozen message')
    const id = `history-${index}`
    const textParts =
      typeof raw.content === 'string'
        ? raw.content
          ? [raw.content]
          : []
        : Array.isArray(raw.content)
          ? raw.content.map(part => {
              if (!object(part) || part.type !== 'text' || typeof part.text !== 'string')
                throw new Error('unsupported frozen content')
              return part.text
            })
          : []
    const textBlocks = textParts.map((text, block) => ({
      id: `${id}-text-${block}`,
      kind: 'text',
      text,
      visibility: visible,
    }))
    if (raw.role === 'assistant') {
      const blocks: unknown[] = [...textBlocks]
      if (Array.isArray(raw.reasoning_details)) {
        blocks.push({
          id: `${id}-thinking`,
          kind: 'thinking',
          text: '',
          opaque: toOpaqueJson({ routeName, reasoning_details: raw.reasoning_details }),
          visibility: visible,
        })
      } else if (typeof raw.reasoning === 'string') {
        blocks.push({
          id: `${id}-thinking`,
          kind: 'thinking',
          text: raw.reasoning,
          visibility: visible,
        })
      }
      if (Array.isArray(raw.tool_calls)) {
        for (const [callIndex, call] of raw.tool_calls.entries()) {
          if (!object(call) || !object(call.function)) throw new Error('invalid frozen tool call')
          if (
            typeof call.id !== 'string' ||
            typeof call.function.name !== 'string' ||
            typeof call.function.arguments !== 'string'
          )
            throw new Error('invalid frozen tool call fields')
          blocks.push({
            id: `${id}-call-${callIndex}`,
            kind: 'tool_call',
            callId: call.id,
            tool: call.function.name,
            arguments: JSON.parse(call.function.arguments),
            complete: true,
            visibility: visible,
          })
        }
      }
      return judgedMessage({
        id,
        type: 'assistant',
        response: `${id}-response`,
        ending: 'complete',
        createdAt: at,
        blocks,
      })
    }
    if (raw.role === 'tool') {
      if (typeof raw.tool_call_id !== 'string') throw new Error('invalid frozen tool result')
      return judgedMessage({
        id,
        type: 'tool',
        callId: raw.tool_call_id,
        createdAt: at,
        blocks: [
          {
            id: `${id}-result`,
            kind: 'tool_result',
            callId: raw.tool_call_id,
            outcome: 'completed',
            blocks: textBlocks,
            visibility: visible,
          },
        ],
      })
    }
    return judgedMessage({ id, type: raw.role, createdAt: at, blocks: textBlocks })
  })
}
function historyInput(body: JsonObject, definition: ModelDefinition): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['xai'],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('xai-opaque-history-local', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider: 'xai',
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
    parameters: {
      maxOutputTokens: 128,
      ...(object(body.reasoning) && body.reasoning.effort === 'high'
        ? { reasoningEffort: 'high' as const }
        : {}),
    },
    messages: historyMessages(body, definition.modelId),
    tools: Array.isArray(body.tools)
      ? [
          {
            name: 'lookup__xai',
            description: 'Look up a value by key',
            parameters: {
              type: 'object',
              properties: { key: { type: 'string' } },
              required: ['key'],
              additionalProperties: false,
            },
          },
        ]
      : [],
  }
}

describe('unbound xAI encrypted history estimate', () => {
  it.each(historyRows)(
    'preserves $model/$scenario original detail bytes and counts final wire',
    row => {
      const body = historyBody(row)
      const definition = xaiDefinitions.find(item => item.modelId === row.model)
      if (!definition) throw new Error('missing official xAI definition')
      const candidate = createXaiHistoryCandidateInputMeter(definition)
      if (!candidate) throw new Error('missing candidate')
      const messages = body.messages
      if (!Array.isArray(messages)) throw new Error('missing messages')
      const carried = messages.flatMap(message =>
        object(message) && Array.isArray(message.reasoning_details)
          ? message.reasoning_details
          : [],
      )
      expect(createHash('sha256').update(writeJsonLossless(carried)).digest('hex')).toBe(
        row.detailsSha256,
      )
      const summary = carried.find(detail => object(detail) && detail.type === 'reasoning.summary')
      const encrypted = carried.find(
        detail => object(detail) && detail.type === 'reasoning.encrypted',
      )
      if (!object(encrypted) || typeof encrypted.data !== 'string')
        throw new Error('missing encrypted detail')
      const summaryText =
        object(summary) && typeof summary.summary === 'string' ? summary.summary : ''
      expect(
        Math.floor(
          Math.max(
            Buffer.byteLength(summaryText, 'utf8'),
            Math.floor((Buffer.byteLength(encrypted.data, 'utf8') * 3) / 4),
          ) / 4,
        ),
      ).toBe(row.nativeReasoningTokens)
      expect(directFull(candidate, { body, serialized: writeJsonLossless(body) })).toEqual({
        kind: 'estimated',
        tokens: row.candidateEstimateTokens,
      })
      expect(row.originalOutcomeSha256).toMatch(/^[0-9a-f]{64}$/u)
    },
  )

  it('rejects unknown association, format and mutated serialization without altering source', () => {
    const row = historyRows.find(item => item.scenario === 'fit-short')
    if (!row) throw new Error('missing fit fixture')
    const body = historyBody(row)
    const definition = xaiDefinitions.find(item => item.modelId === row.model)
    if (!definition) throw new Error('missing definition')
    const candidate = createXaiHistoryCandidateInputMeter(definition)
    if (!candidate || !Array.isArray(body.messages))
      throw new Error('missing candidate or messages')
    const original = writeJsonLossless(body)
    const last = body.messages.find(
      message => object(message) && Array.isArray(message.reasoning_details),
    )
    if (!object(last) || !Array.isArray(last.reasoning_details)) throw new Error('missing detail')
    const encrypted = last.reasoning_details.at(-1)
    if (!object(encrypted)) throw new Error('missing encrypted item')
    for (const details of [
      [{ ...encrypted, format: 'unknown-v2' }],
      [encrypted, { ...encrypted, index: 1 }],
      [{ ...encrypted, data: '' }],
    ]) {
      const changed = {
        ...body,
        messages: body.messages.map(message =>
          message === last ? { ...last, reasoning_details: details } : message,
        ),
      }
      expect(
        directFull(candidate, { body: changed, serialized: writeJsonLossless(changed) }),
      ).toEqual({
        kind: 'unavailable',
      })
    }
    expect(directFull(candidate, { body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    const changed = {
      ...body,
      messages: body.messages.map(message =>
        message === last
          ? { ...last, reasoning_details: [{ ...encrypted, data: `${encrypted.data}x` }] }
          : message,
      ),
    }
    expect(createHash('sha256').update(writeJsonLossless(changed)).digest('hex')).not.toBe(
      row.finalWireSha256,
    )
    expect(writeJsonLossless(body)).toBe(original)
    expect(
      createXaiHistoryCandidateInputMeter({
        ...definition,
        implementation: { ...definition.implementation, revision: 'wrong' },
      }),
    ).toBeUndefined()
    expect(
      createXaiHistoryCandidateInputMeter({ ...definition, revision: 'wrong' }),
    ).toBeUndefined()
  })

  it.each(historyRows.filter(row => row.scenario !== 'fit-multilingual'))(
    'plans and sends exact $model/$scenario history bytes over local TLS with external margin',
    async row => {
      const body = historyBody(row)
      const definition = xaiDefinitions.find(item => item.modelId === row.model)
      if (!definition) throw new Error('missing definition')
      const candidate = createXaiHistoryCandidateInputMeter(definition)
      if (!candidate) throw new Error('missing candidate')
      const input = historyInput(body, definition)
      const cert = certificate()
      const host = await fixture(
        cert.tls,
        res => res.end(content('ok') + finish()),
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [candidate],
      })
      try {
        const plan = await transport.plan(input, { signal: new AbortController().signal })
        if ('rejected' in plan) throw new Error(JSON.stringify(plan))
        expect(createHash('sha256').update(plan.planned.serialized).digest('hex')).toBe(
          row.finalWireSha256,
        )
        expect(plan.planned.inputLimitEvidence).toMatchObject({
          inputTokens: { kind: 'estimated' },
          meterRevision: candidate.algorithmRevision,
        })
        const evidence = plan.planned.inputLimitEvidence
        if (evidence.inputTokens.kind !== 'estimated' || evidence.admissionTokens === undefined)
          throw new Error('missing estimated admission')
        expect(Number(jsonNumberSource(evidence.admissionTokens))).toBe(
          Math.ceil(Number(jsonNumberSource(evidence.inputTokens.tokens)) * 1.2) + 32,
        )
        const result = await invokeModel({
          ...input,
          transport,
          credential: 'local-test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        expect(result).toMatchObject({ outcome: 'complete' })
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(plan.planned.serialized)
      } finally {
        await transport.close()
        await host.close()
        cert.dispose()
      }
    },
  )
})
