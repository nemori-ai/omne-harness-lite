import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { ModelInputMeter } from '@omne-harness/model-contract'
import { sortedJsonText } from '@omne-harness/pi-ai-transport/testing'
import {
  assembledOf,
  bindingOf,
  fixedRequest,
  MARGIN_SOURCE,
  message,
  officialProfile,
  RECORD,
  speechBlock,
  stateBlock,
  supplierOf,
  textBlock,
  thinkingBlock,
  TOKENIZER,
  type RequestParts,
} from './support/qwen.ts'
import { componentAdoption } from '@omne-harness/pi-ai-transport/family-kit'
import { QWEN_OWNER } from '../src/owner.ts'

type Measured = Awaited<ReturnType<ModelInputMeter['measure']>>

async function planAndMeasure(
  parts: RequestParts,
  change: (tokenInput: JsonValue) => JsonValue = value => value,
): Promise<Readonly<{ measured: Measured; tokenInput: JsonValue }>> {
  const binding = await bindingOf()
  const profile = officialProfile()
  const request = fixedRequest(parts)
  const planned = binding.rules.plan({
    profile,
    supplier: supplierOf(),
    assembled: assembledOf(request),
  })
  if (!('ok' in planned)) throw new Error(`plan: ${JSON.stringify(planned.failure)}`)
  const representation = {
    ...planned.ok.representation,
    tokenInput: change(planned.ok.representation.tokenInput),
  }
  const measured = await binding.meter.measure({
    profile: profile.adoption,
    supplier: profile.definition.suppliers[0],
    context: profile.definition.context,
    limits: profile.definition.limits,
    assembled: assembledOf(request),
    parameters: planned.ok.parameters,
    representation,
  })
  await binding.release()
  return { measured, tokenInput: representation.tokenInput }
}

describe('measure', () => {
  it('estimates the visible projection with the o200k proxy and the configured margin', async () => {
    const { measured, tokenInput } = await planAndMeasure({
      system: [textBlock('s1', 'instruction')],
      messages: [message('u1', 'user', [textBlock('b1', 'hello world')])],
    })
    if (!('ok' in measured)) throw new Error(JSON.stringify(measured.failure))
    const counted = await TOKENIZER.count([{ kind: 'text', text: sortedJsonText(tokenInput) }])
    if (!('ok' in counted)) throw new Error('count failed')
    const amount = Number(counted.ok.tokens)
    expect(measured.ok.kind).toBe('complete')
    expect(measured.ok.checks).toEqual([
      {
        supplier: supplierOf().adoption,
        metric: 'input-tokens',
        subject: 'request',
        measurement: {
          kind: 'estimate',
          amount: String(amount),
          margin: String(Math.ceil(amount / 10)),
          method: componentAdoption(QWEN_OWNER, RECORD, 'meter'),
          marginSource: MARGIN_SOURCE,
        },
        limit: '983616',
        constraint: {
          profile: officialProfile().adoption,
          upstream: {
            kind: 'finite',
            amount: '983616',
            source: componentAdoption(QWEN_OWNER, RECORD, 'evidence'),
          },
        },
      },
    ])
    expect(writeJsonText(tokenInput)).toContain('"role":"system"')
  })

  it('counts no token for speech and checks its duration against the profile limit', async () => {
    const { measured, tokenInput } = await planAndMeasure({
      messages: [message('u1', 'user', [textBlock('b1', 'hear this'), speechBlock('b2')])],
    })
    if (!('ok' in measured)) throw new Error(JSON.stringify(measured.failure))
    expect(writeJsonText(tokenInput)).not.toContain('voice')
    expect(measured.ok.checks).toContainEqual(
      expect.objectContaining({
        metric: 'voice-duration-ms',
        subject: 'speech-1',
        measurement: expect.objectContaining({ kind: 'exact', amount: '1500' }),
        limit: '300000',
      }),
    )
  })

  it('a reply whose reasoning is carried back is not estimated: without its recorded output it is uncountable', async () => {
    const payload =
      '{"format":"unknown","index":0,"text":"Oslo is at 59.9 N.","type":"reasoning.text"}'
    const scope = 'openrouter/qwen/qwen3.8-omni-flash'
    const { measured } = await planAndMeasure({
      messages: [
        message('u1', 'user', [textBlock('b1', 'which is further north?')]),
        message(
          'a1',
          'assistant',
          [
            thinkingBlock('k1', 'Oslo is at 59.9 N.'),
            textBlock('t1', 'Oslo'),
            stateBlock('s1', payload, ['k1']),
          ],
          { replay: { scope, format: 'qwen-reasoning-text-v1', at: [2] } },
        ),
        message('u2', 'user', [textBlock('b2', 'ok')]),
      ],
    })
    expect(measured).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'reasoning-not-countable' },
    })
  })

  it("refuses a token input that is not this family's shape as invalid", async () => {
    const without =
      (key: string) =>
      (value: JsonValue): JsonValue =>
        value.kind === 'object'
          ? { kind: 'object', entries: value.entries.filter(entry => entry.key !== key) }
          : value
    const flat = (value: JsonValue): JsonValue =>
      value.kind === 'object'
        ? {
            kind: 'object',
            entries: value.entries.map(entry =>
              entry.key === 'messages' && entry.value.kind === 'array'
                ? {
                    key: 'messages',
                    value: { kind: 'array', items: entry.value.items.map(without('content')) },
                  }
                : entry,
            ),
          }
        : value
    const parts = { messages: [message('u1', 'user', [textBlock('b1', 'hello')])] }
    for (const change of [without('messages'), flat]) {
      const { measured } = await planAndMeasure(parts, change)
      expect(measured).toEqual({
        failure: { kind: 'invalid', field: 'tokenInput', reason: 'schema' },
      })
    }
  })

  it('counts a tool call and its result with the words around them', async () => {
    const shown = { toHuman: true, toModel: true }
    const call = {
      kind: 'tool_call',
      id: 'c1',
      visibility: shown,
      callId: 'call_a',
      name: 'lookup',
      arguments: {
        kind: 'object',
        entries: [{ key: 'q', value: { kind: 'string', value: 'giraffe' } }],
      },
    }
    const result = { kind: 'tool_result', id: 'r1', visibility: shown, callId: 'call_a' }
    const { measured, tokenInput } = await planAndMeasure({
      messages: [
        message('u1', 'user', [textBlock('b1', 'look it up')]),
        message('a1', 'assistant', [call]),
        message('t1', 'tool', [result, textBlock('b2', 'found')]),
      ],
    })
    if (!('ok' in measured)) throw new Error(JSON.stringify(measured.failure))
    const text = sortedJsonText(tokenInput)
    expect(text).toContain('look it up')
    expect(text).toContain('"name":"lookup"')
    expect(text).toContain('giraffe')
    expect(text).toContain('"type":"tool_result"')
  })
})
