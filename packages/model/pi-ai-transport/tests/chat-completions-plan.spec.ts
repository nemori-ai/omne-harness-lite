import type { Parameter, ParameterAdoption } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import {
  bindChatCompletions,
  type ChatCompletionsRecord,
  type VendorHooks,
} from '../src/chat-completions/index.ts'
import type { PiFamilyBinding } from '../src/index.ts'
import { serializeBody } from '../src/payload.ts'
import {
  EXTENSION,
  FORMAT,
  REPRESENTATION,
  SCOPE,
  SOURCE,
  adoption,
  assembledOf,
  callBlock,
  engineProbe,
  fixedRequest,
  message,
  profileOf,
  resultBlock,
  stateBlock,
  supplierOf,
  testHooks,
  testMeter,
  testRecord,
  textBlock,
  type EngineProbe,
  type RequestParts,
} from './support/chat-record.ts'

function bind(
  record: ChatCompletionsRecord = testRecord(),
  probe: EngineProbe = engineProbe(),
  hooks: VendorHooks = testHooks(probe),
): PiFamilyBinding {
  return bindChatCompletions({
    record,
    supplier: supplierOf(record),
    hooks,
    meter: testMeter(record, probe),
    release: async () => {
      probe.released += 1
    },
  })
}

function plan(
  binding: PiFamilyBinding,
  record: ChatCompletionsRecord,
  parts: RequestParts = {},
  profile = profileOf(record),
) {
  const request = fixedRequest(record, parts)
  return binding.rules.plan({
    profile,
    supplier: request.suppliers[0],
    assembled: assembledOf(request),
  })
}

function adoptionsOf(outcome: ReturnType<typeof plan>): readonly ParameterAdoption[] {
  if (!('ok' in outcome)) throw new Error(`plan failed: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok.parameters
}

function applied(outcome: ReturnType<typeof plan>): readonly Parameter[] {
  return adoptionsOf(outcome).map(item => item.applied)
}

describe('rules.plan: the replay declaration', () => {
  it('accepts a profile whose declaration equals the record declaration once defaults apply', () => {
    const record = testRecord()
    const spelled = profileOf(record, {
      replay: { produces: SCOPE, accepts: [SCOPE], foreignThinking: 'omit' },
    })
    expect('ok' in plan(bind(record), record, {}, spelled)).toBe(true)
  })

  it('refuses a profile whose declaration for this supplier differs', () => {
    const record = testRecord()
    const differing = profileOf(record, { replay: { foreignThinking: 'text' } })
    expect(plan(bind(record), record, {}, differing)).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'suppliers[0].replay',
        adapter: supplierOf(record).adoption,
      },
    })
  })
})

describe('rules.plan: parameters', () => {
  const record = testRecord()
  const adapter = supplierOf(record).adoption

  it('records each omitted supported kind with a default as origin default', () => {
    expect(adoptionsOf(plan(bind(record), record))).toEqual([
      {
        supplier: adapter,
        applied: { kind: 'max-output-tokens', value: '1000' },
        origin: { kind: 'default', source: adapter },
      },
      {
        supplier: adapter,
        applied: { kind: 'reasoning-effort', value: 'medium' },
        origin: { kind: 'default', source: adapter },
      },
    ])
  })

  it('records an explicit value with the request value and source', () => {
    const temperature = { kind: 'temperature', value: 0.5 }
    const adoptions = adoptionsOf(plan(bind(record), record, { parameters: [temperature] }))
    expect(adoptions[0]).toEqual({
      supplier: adapter,
      applied: temperature,
      origin: { kind: 'explicit', requested: temperature, source: SOURCE },
    })
  })

  it('refuses an explicit kind that the record does not support', () => {
    expect(plan(bind(record), record, { parameters: [{ kind: 'top-p', value: 0.5 }] })).toEqual({
      failure: { kind: 'unsupported', field: 'top-p', adapter },
    })
  })

  it('refuses a reasoning effort that the record maps to unsupported', () => {
    expect(
      plan(bind(record), record, { parameters: [{ kind: 'reasoning-effort', value: 'none' }] }),
    ).toEqual({
      failure: { kind: 'unsupported', field: 'reasoning-effort', adapter },
    })
  })

  it.each([
    ['temperature', { kind: 'temperature', value: 1.5 }],
    ['max-output-tokens', { kind: 'max-output-tokens', value: '5000' }],
    ['stop', { kind: 'stop', value: ['a', 'b', 'c'] }],
    ['stop', { kind: 'stop', value: ['much-too-long'] }],
  ])('refuses %s out of the record range as invalid', (field, parameter) => {
    expect(plan(bind(record), record, { parameters: [parameter] })).toEqual({
      failure: { kind: 'invalid', field, reason: 'out-of-range' },
    })
  })

  it('refuses max-output-tokens above context.output.provided, explicit or default', () => {
    const small = profileOf(record, { outputLimit: '500' })
    const failure = {
      failure: { kind: 'invalid', field: 'max-output-tokens', reason: 'above-output-limit' },
    }
    expect(
      plan(
        bind(record),
        record,
        { parameters: [{ kind: 'max-output-tokens', value: '600' }] },
        small,
      ),
    ).toEqual(failure)
    expect(plan(bind(record), record, {}, small)).toEqual(failure)
    expect(
      applied(
        plan(
          bind(record),
          record,
          { parameters: [{ kind: 'max-output-tokens', value: '500' }] },
          small,
        ),
      ),
    ).toContainEqual({
      kind: 'max-output-tokens',
      value: '500',
    })
  })

  it('matches an extension by its whole definition adoption and refuses any other', () => {
    const value = { kind: 'number', lexeme: '0.9' }
    const matched = { kind: 'extension', definition: EXTENSION, value }
    expect(applied(plan(bind(record), record, { parameters: [matched] }))).toContainEqual(matched)
    const other = { kind: 'extension', definition: { ...EXTENSION, digest: 'b'.repeat(64) }, value }
    expect(plan(bind(record), record, { parameters: [other] })).toEqual({
      failure: { kind: 'unsupported', field: 'extension', adapter },
    })
    const wrong = {
      kind: 'extension',
      definition: EXTENSION,
      value: { kind: 'string', value: 'x' },
    }
    expect(plan(bind(record), record, { parameters: [wrong] })).toEqual({
      failure: { kind: 'invalid', field: 'extension', reason: 'value' },
    })
  })
})

describe('rules.plan: the prefix degrade', () => {
  const record = testRecord({
    replay: {
      declaration: {},
      formats: { produces: FORMAT, accepts: [FORMAT] },
      prefix: { kind: 'last-tool-turn', degrade: 'disable-reasoning' },
    },
  })
  const adapter = supplierOf(record).adoption

  function history(scope: string): readonly unknown[] {
    return [
      message('u1', 'user', [textBlock('b1', 'question')]),
      message('a1', 'assistant', [stateBlock('s1', 'sealed'), callBlock('c1', 'call_1')], {
        replay: { scope, format: FORMAT, at: [0] },
      }),
      message('t1', 'tool', [resultBlock('r1', 'call_1'), textBlock('b2', 'answer')]),
    ]
  }

  it('turns reasoning off and records it when the last tool turn came from another scope', () => {
    const adoptions = adoptionsOf(
      plan(bind(record), record, { messages: history('gateway/other') }),
    )
    expect(adoptions).toContainEqual({
      supplier: adapter,
      applied: { kind: 'reasoning-effort', value: 'none' },
      origin: { kind: 'default', source: adapter },
    })
  })

  it('keeps the explicit request in the adoption of a degraded request', () => {
    const high = { kind: 'reasoning-effort', value: 'high' }
    const adoptions = adoptionsOf(
      plan(bind(record), record, { messages: history('gateway/other'), parameters: [high] }),
    )
    expect(adoptions).toContainEqual({
      supplier: adapter,
      applied: { kind: 'reasoning-effort', value: 'none' },
      origin: { kind: 'explicit', requested: high, source: SOURCE },
    })
  })

  it('keeps reasoning when the last tool turn can continue', () => {
    expect(applied(plan(bind(record), record, { messages: history(SCOPE) }))).toContainEqual({
      kind: 'reasoning-effort',
      value: 'medium',
    })
  })

  it('degrades when the request turns replay off', () => {
    expect(
      applied(plan(bind(record), record, { messages: history(SCOPE), replay: 'off' })),
    ).toContainEqual({
      kind: 'reasoning-effort',
      value: 'none',
    })
  })

  it('does not degrade a record without the prefix rule', () => {
    const plain = testRecord()
    expect(
      applied(plan(bind(plain), plain, { messages: history('gateway/other') })),
    ).toContainEqual({
      kind: 'reasoning-effort',
      value: 'medium',
    })
  })
})

describe('rules.plan: the family check and the representation', () => {
  const record = testRecord()

  it('gives the family check the applied values and the treatments, and returns its failure', () => {
    const probe = engineProbe()
    probe.checkFailure = { kind: 'invalid', field: 'temperature', reason: 'while-thinking' }
    const outcome = plan(bind(record, probe), record, {
      parameters: [{ kind: 'temperature', value: 0.2 }],
    })
    expect(outcome).toEqual({ failure: probe.checkFailure })
    expect(probe.checks[0]?.applied).toContainEqual({ kind: 'temperature', value: 0.2 })
  })

  it('represents the projection through the meter, with the bytes that encode writes', () => {
    const probe = engineProbe()
    const binding = bind(record, probe)
    const outcome = plan(binding, record)
    if (!('ok' in outcome)) throw new Error('plan failed')
    const request = fixedRequest(record, { parameterAdoptions: outcome.ok.parameters })
    const encoded = binding.encode({ request, media: [] })
    if (!('ok' in encoded)) throw new Error('encode failed')
    expect(outcome.ok.representation).toEqual(encoded.ok.representation)
    expect(encoded.ok.representation).toEqual({
      kind: 'materialized',
      adoption: REPRESENTATION,
      tokenInput: { kind: 'string', value: 'turns:1' },
      media: [],
      requestBytes: String(serializeBody(encoded.ok.body).byteLength),
    })
    expect(probe.views[0]).toEqual(probe.views[1])
  })

  it('refuses when the meter represents with another adoption than the assembled one', () => {
    const probe = engineProbe()
    probe.representation = adoption('other-representation')
    expect(plan(bind(record, probe), record)).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'representation',
        adapter: supplierOf(record).adoption,
      },
    })
  })
})
