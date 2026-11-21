import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { ModelInputMeter } from '@omne-harness/model-contract'
import { componentAdoption } from '../src/adoptions.ts'
import { sortedJsonText } from './support/sorted-json.ts'
import {
  assembledOf,
  bindingOf,
  fixedRequest,
  MARGIN_SOURCE,
  message,
  officialProfile,
  RECORD,
  speechBlock,
  supplierOf,
  textBlock,
  TOKENIZER,
  type RequestParts,
} from './support/qwen.ts'

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
          method: componentAdoption(RECORD, 'meter'),
          marginSource: MARGIN_SOURCE,
        },
        limit: '983616',
        constraint: {
          profile: officialProfile().adoption,
          upstream: {
            kind: 'finite',
            amount: '983616',
            source: componentAdoption(RECORD, 'evidence'),
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

  it('refuses to estimate an image, which this record has no rule for', async () => {
    const image: JsonValue = {
      kind: 'object',
      entries: [{ key: 'type', value: { kind: 'string', value: 'image' } }],
    }
    const withImage = (value: JsonValue): JsonValue => {
      if (value.kind === 'array') return { kind: 'array', items: value.items.map(withImage) }
      if (value.kind !== 'object') return value
      return {
        kind: 'object',
        entries: value.entries.map(entry =>
          entry.key === 'content' && entry.value.kind === 'array'
            ? { key: 'content', value: { kind: 'array', items: [...entry.value.items, image] } }
            : { key: entry.key, value: withImage(entry.value) },
        ),
      }
    }
    const { measured } = await planAndMeasure({}, withImage)
    expect(measured).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'image 0',
        adapter: componentAdoption(RECORD, 'media'),
      },
    })
  })
})
