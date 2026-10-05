import { testDefinitions } from './definitions.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LosslessNumber,
  isJsonNumber,
  jsonNumberSource,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { PlannedRequest } from '@omne-harness-lite/model-request-runtime'
import { planRequest } from './synthetic-input-meter.ts'
import { certificate, finish, fixture, input, type CapturedRequest } from './support.ts'

// T-10a/b: accepted transport parameter table, runtime/3 S-54/57/58,
// profile/3 S-16/17/21. This checks the public serializer, not model support.
const mapping = [
  ['temperature', 'temperature'],
  ['topP', 'top_p'],
  ['seed', 'seed'],
  ['maxOutputTokens', 'max_tokens'],
  ['stopSequences', 'stop'],
  ['frequencyPenalty', 'frequency_penalty'],
  ['presencePenalty', 'presence_penalty'],
] as const

let cert: ReturnType<typeof certificate>
let evidenceIndex = 0
const evidenceDirectory = process.env.OMNE_PARAMETER_EVIDENCE_DIR
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function recordEvidence(value: unknown): void {
  if (evidenceDirectory === undefined) return
  writeFileSync(
    join(evidenceDirectory, `case-${++evidenceIndex}.json`),
    `${writeJsonLossless(value)}\n`,
  )
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

function parseObject(text: string): JsonObject {
  const result = readJsonStrict(text)
  if ('failed' in result || !isObject(result.ok)) throw new Error('expected strict JSON object')
  return result.ok
}

function exactSource(value: JsonValue | undefined): string {
  if (!isJsonNumber(value)) throw new Error('expected exact JSON number')
  return jsonNumberSource(value)
}

function assertWire(plan: PlannedRequest, captured: CapturedRequest): JsonObject {
  expect(captured.method).toBe('POST')
  expect(captured.path).toBe('/api/v1/chat/completions')
  expect(captured.body).toBe(plan.serialized)
  const wire = parseObject(captured.body)
  expect(writeJsonLossless(wire)).toBe(writeJsonLossless(plan.body))
  for (const [name, key] of mapping) {
    const parameter = plan.parameters[name]
    if (parameter === undefined) expect(wire).not.toHaveProperty(key)
    else expect(writeJsonLossless(wire[key])).toBe(writeJsonLossless(parameter))
  }
  if (plan.parameters.reasoningEffort === undefined) expect(wire).not.toHaveProperty('reasoning')
  else expect(wire.reasoning).toEqual({ effort: plan.parameters.reasoningEffort })
  for (const [key, value] of Object.entries(plan.parameters.extra ?? {}))
    expect(writeJsonLossless(wire[key])).toBe(writeJsonLossless(value))
  expect(wire.model).toBe(input().routeName)
  expect(wire.provider).toEqual({
    order: ['openai'],
    allow_fallbacks: false,
    require_parameters: true,
  })
  expect(wire.stream).toBe(true)
  expect(wire.store).toBe(false)
  expect(wire).not.toHaveProperty('max_completion_tokens')
  expect(wire).not.toHaveProperty('reasoning_effort')
  return wire
}

async function sentParameters(parameters: ModelRequestParameters, afterPlan?: () => void) {
  const host = await fixture(cert.tls, res => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(finish())
  })
  try {
    const requested = parseObject(writeJsonLossless(parameters))
    const result = await planRequest({ ...input(), parameters }, testDefinitions)
    if ('rejected' in result) throw new Error(`unexpected plan rejection: ${result.rejected}`)
    // Planning must not be an alternate send path.
    expect(host.requests).toHaveLength(0)
    afterPlan?.()
    const signal = new AbortController().signal
    const sent = await host.transport.send(result.planned, 'parameter-test-local-only', signal)
    if (!('response' in sent)) throw new Error(`send failed: ${writeJsonLossless(sent)}`)
    const reader = host.transport.read(sent.response, result.planned, signal)
    while (true) {
      const next = await reader.next()
      if (next.done) {
        expect(next.value).toMatchObject({ ended: 'end' })
        break
      }
    }
    expect(host.requests).toHaveLength(1)
    const captured = host.requests[0]
    if (!captured) throw new Error('missing actual HTTPS request')
    recordEvidence({
      requested,
      parameters: result.planned.parameters,
      droppedParameters: result.planned.droppedParameters ?? [],
      serialized: result.planned.serialized,
      actualBody: captured.body,
      method: captured.method ?? null,
      path: captured.path ?? null,
      requests: host.requests.length,
    })
    // S-17 forbids empty extra in every position, including actual parameters.
    expect(
      'ok' in judgeModelProfileDocument('ModelRequestParameters', result.planned.parameters),
    ).toBe(true)
    return { plan: result.planned, wire: assertWire(result.planned, captured) }
  } finally {
    await host.close()
  }
}

async function rejectedBeforeSend(request: PlanInput) {
  const host = await fixture(cert.tls, res => res.end(finish()))
  try {
    const result = await planRequest(request, testDefinitions)
    // Exercise the normal plan-then-send branch so an accidental acceptance
    // produces an observable network request as well as a failed assertion.
    if ('planned' in result) {
      const signal = new AbortController().signal
      const sent = await host.transport.send(result.planned, 'parameter-test-local-only', signal)
      if ('response' in sent) {
        const reader = host.transport.read(sent.response, result.planned, signal)
        for await (const _event of reader) {
          /* drain owned response */
        }
      }
    }
    recordEvidence({
      requested: request.parameters,
      configuration: request.snapshot.adaptation.configuration,
      result,
      requests: host.requests.length,
    })
    expect(result).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    expect(host.requests).toHaveLength(0)
  } finally {
    await host.close()
  }
}

describe('T-10 public plan parameters agree with actual HTTPS bytes', () => {
  it('the wire oracle detects coordinated missing, lossy and overwritten transcripts', async () => {
    const result = await planRequest(
      {
        ...input(),
        parameters: {
          temperature: new LosslessNumber('0.123456789012345678901'),
          seed: new LosslessNumber('9007199254740993'),
        },
      },
      testDefinitions,
    )
    if ('rejected' in result) throw new Error('oracle control plan rejected')
    const plan = result.planned
    const captured = {
      method: 'POST',
      path: '/api/v1/chat/completions',
      headers: {},
      body: plan.serialized,
    }
    expect(() => assertWire(plan, captured)).not.toThrow()
    const { temperature: _omitted, ...missing } = plan.body
    for (const body of [
      missing,
      { ...plan.body, temperature: 0.12345678901234568 },
      { ...plan.body, seed: 9007199254740992 },
      { ...plan.body, model: 'override' },
      { ...plan.body, provider: { order: ['override'], allow_fallbacks: true } },
    ]) {
      const serialized = writeJsonLossless(body)
      const corrupted = { ...plan, body, serialized }
      expect(() => assertWire(corrupted, { ...captured, body: serialized })).toThrow()
    }
  })
  it('keeps every absent unified parameter absent, including reasoning', async () => {
    const { plan, wire } = await sentParameters({})
    expect(plan.parameters).toEqual({})
    expect(plan).not.toHaveProperty('parameterAdjustments')
    expect(plan).not.toHaveProperty('droppedParameters')
    for (const [, key] of mapping) expect(wire).not.toHaveProperty(key)
    expect(wire).not.toHaveProperty('reasoning')
  })

  it('maps all seven unified fields without clamping or losing decimal and integer precision', async () => {
    const parameters = {
      temperature: new LosslessNumber('0.123456789012345678901'),
      topP: new LosslessNumber('0.999999999999999999999'),
      seed: new LosslessNumber('9007199254740993'),
      maxOutputTokens: 4096,
      stopSequences: ['끝🙂', '\r\n'],
      frequencyPenalty: -2,
      presencePenalty: 2,
    }
    const { plan, wire } = await sentParameters(parameters)
    expect(writeJsonLossless(plan.parameters)).toBe(writeJsonLossless(parameters))
    expect(exactSource(wire.temperature)).toBe('0.123456789012345678901')
    expect(exactSource(wire.top_p)).toBe('0.999999999999999999999')
    expect(exactSource(wire.seed)).toBe('9007199254740993')
    expect(wire.max_tokens).toBe(4096)
    expect(wire.stop).toEqual(['끝🙂', '\r\n'])
    expect(wire.frequency_penalty).toBe(-2)
    expect(wire.presence_penalty).toBe(2)
    expect(plan).not.toHaveProperty('parameterAdjustments')
    expect(plan).not.toHaveProperty('droppedParameters')
  })

  it('retains legal zero unified values and empty or precise private JSON values', async () => {
    const extra = {
      private_zero: 0,
      private_false: false,
      private_null: null,
      private_text: '',
      private_array: [],
      private_object: {},
      private_nested: {
        decimal: new LosslessNumber('0.000000000000000000000000000123456789'),
        integer: new LosslessNumber('9007199254740993'),
        exponent: new LosslessNumber('1e400'),
      },
    }
    const parameters = { temperature: 0, seed: 0, frequencyPenalty: 0, presencePenalty: 0, extra }
    const { plan, wire } = await sentParameters(parameters)
    for (const key of ['temperature', 'seed', 'frequency_penalty', 'presence_penalty'])
      expect(exactSource(wire[key])).toBe('0')
    expect(Object.keys(plan.parameters.extra ?? {}).sort()).toEqual(Object.keys(extra).sort())
    for (const [key, value] of Object.entries(extra))
      expect(writeJsonLossless(wire[key])).toBe(writeJsonLossless(value))
    const nested = wire.private_nested
    if (!isObject(nested)) throw new Error('missing private nested object')
    expect(exactSource(nested.decimal)).toBe('0.000000000000000000000000000123456789')
    expect(exactSource(nested.integer)).toBe('9007199254740993')
    expect(exactSource(nested.exponent)).toBe('1e400')
    expect(plan).not.toHaveProperty('droppedParameters')
  })

  it('sends the frozen planned values after the caller changes its parameters', async () => {
    const parameters = {
      temperature: 0,
      stopSequences: ['original'],
      extra: { private_nested: { value: 'original' } },
    }
    const { plan, wire } = await sentParameters(parameters, () => {
      parameters.temperature = 2
      parameters.stopSequences[0] = 'changed'
      parameters.extra.private_nested.value = 'changed'
    })
    expect(wire.temperature).toBe(0)
    expect(wire.stop).toEqual(['original'])
    expect(wire.private_nested).toEqual({ value: 'original' })
    expect(Object.isFrozen(plan.parameters)).toBe(true)
    expect(Object.isFrozen(plan.parameters.stopSequences)).toBe(true)
    expect(Object.isFrozen(plan.parameters.extra?.private_nested)).toBe(true)
    expect(Reflect.set(plan.body, 'stream', false)).toBe(false)
  })

  it.each(['none', 'low', 'medium', 'high'] as const)(
    'translates explicit reasoning effort %s without treating it as absence',
    async reasoningEffort => {
      const { plan, wire } = await sentParameters({ reasoningEffort })
      expect(plan.parameters).toEqual({ reasoningEffort })
      expect(wire.reasoning).toEqual({ effort: reasoningEffort })
      expect(plan).not.toHaveProperty('parameterAdjustments')
      expect(plan).not.toHaveProperty('droppedParameters')
    },
  )

  it('records max as dropped and sends no replacement reasoning value', async () => {
    const { plan, wire } = await sentParameters({ reasoningEffort: 'max' })
    expect(plan.parameters).toEqual({})
    expect(plan.droppedParameters).toEqual(['reasoningEffort'])
    expect(wire).not.toHaveProperty('reasoning')
    expect(plan).not.toHaveProperty('parameterAdjustments')
  })

  it('records every explicit protected extra key and preserves fixed route and messages', async () => {
    const extra = {
      model: 'override',
      messages: [],
      stream: false,
      stream_options: { include_usage: false },
      provider: { order: ['override'], allow_fallbacks: true, require_parameters: false },
      models: ['override'],
      route: 'fallback',
      tools: [],
      tool_choice: 'none',
      user: 'override-user',
      session_id: 'override-session',
      prompt_cache_key: 'override-cache-key',
      store: true,
      transforms: ['override'],
      max_tokens: 1,
      max_completion_tokens: 2,
      top_p: 0,
      stop: [],
      frequency_penalty: 2,
      presence_penalty: -2,
      reasoning: { effort: 'high' },
      reasoning_effort: 'high',
      private_flag: false,
    }
    const { plan, wire } = await sentParameters({ extra })
    expect(plan.parameters).toEqual({ extra: { private_flag: false } })
    expect(plan.droppedParameters).toEqual(
      Object.keys(extra)
        .filter(key => key !== 'private_flag')
        .sort(),
    )
    const baseline = await planRequest({ ...input(), parameters: {} }, testDefinitions)
    if ('rejected' in baseline) throw new Error('baseline rejected')
    expect(writeJsonLossless(wire.messages)).toBe(writeJsonLossless(baseline.planned.body.messages))
    for (const key of Object.keys(extra)) {
      if (!['model', 'messages', 'stream', 'provider', 'store', 'private_flag'].includes(key))
        expect(wire).not.toHaveProperty(key)
    }
    expect(wire.private_flag).toBe(false)
    expect(plan).not.toHaveProperty('parameterAdjustments')
  })

  it('protected upstream spellings cannot override present unified values', async () => {
    const parameters = {
      topP: new LosslessNumber('0.8'),
      maxOutputTokens: 128,
      stopSequences: ['finish'],
      frequencyPenalty: 0,
      presencePenalty: 0,
      reasoningEffort: 'none',
      extra: {
        top_p: 0.2,
        max_tokens: 1,
        max_completion_tokens: 2,
        stop: ['override'],
        frequency_penalty: 2,
        presence_penalty: -2,
        reasoning: { effort: 'high' },
        reasoning_effort: 'high',
      },
    } satisfies ModelRequestParameters
    const { plan, wire } = await sentParameters(parameters)
    const { extra: _dropped, ...expected } = parameters
    for (const [name, value] of Object.entries(expected))
      expect(writeJsonLossless(Object.getOwnPropertyDescriptor(plan.parameters, name)?.value)).toBe(
        writeJsonLossless(value),
      )
    expect(plan.parameters).not.toHaveProperty('extra')
    expect(plan.droppedParameters).toEqual(Object.keys(parameters.extra).sort())
    expect(exactSource(wire.top_p)).toBe('0.8')
    expect(wire.max_tokens).toBe(128)
    expect(wire.stop).toEqual(['finish'])
    expect(wire.frequency_penalty).toBe(0)
    expect(wire.presence_penalty).toBe(0)
    expect(wire.reasoning).toEqual({ effort: 'none' })
    expect(plan).not.toHaveProperty('parameterAdjustments')
  })

  it.each([
    ['topP zero', { topP: 0 }],
    ['output limit zero', { maxOutputTokens: 0 }],
    ['temperature just above two', { temperature: new LosslessNumber('2.000000000000000000001') }],
    [
      'fractional seed beyond Number precision',
      { seed: new LosslessNumber('1.000000000000000000001') },
    ],
    ['empty stop array', { stopSequences: [] }],
    ['empty stop string', { stopSequences: [''] }],
    ['empty extra object', { extra: {} }],
    ['extra shadows unified temperature', { extra: { temperature: 0 } }],
    ['extra shadows unified seed', { extra: { seed: 0 } }],
  ] as const)('rejects %s before any HTTPS send', async (_label, parameters) => {
    await rejectedBeforeSend({ ...input(), parameters })
  })

  it('rejects tuning parameters hidden in adaptation configuration with zero HTTPS', async () => {
    const request = input()
    await rejectedBeforeSend({
      ...request,
      snapshot: {
        ...request.snapshot,
        adaptation: {
          ...request.snapshot.adaptation,
          configuration: {
            revision: 'parameter-config-invalid',
            values: { cache: { mode: 'automatic' }, temperature: 0 },
          },
        },
      },
    })
  })
})
