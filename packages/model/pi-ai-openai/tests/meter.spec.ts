// The meter: the three image patch rules with the sealed goldens, the o200k proxy estimate of the
// visible projection with the configured margin, and the requests that have no estimate.
import { describe, expect, it } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { MeterRepresentation, ModelInputMeter } from '@omne-harness/model-contract'
import { componentAdoption } from '../src/adoptions.ts'
import { IMAGE_RULES, type ImageDetail } from '../src/images.ts'
import {
  assembledOf,
  bindingOf,
  fixedRequest,
  imageBlock,
  MARGIN_SOURCE,
  message,
  officialProfile,
  recordNamed,
  stateBlock,
  supplierOf,
  textBlock,
  thinkingBlock,
  type RequestParts,
} from './support/openai.ts'
import type { OpenAiRecord } from '@omne-harness/pi-ai-openai'

const tokens = (
  rule: keyof typeof IMAGE_RULES,
  width: number,
  height: number,
  detail: ImageDetail,
): number | null => IMAGE_RULES[rule]({ width, height, detail })

describe('image rules (sealed openai-images.ts goldens)', () => {
  it.each([
    [1024, 1024, 'high', 1229],
    [2048, 2048, 'high', 3000],
    [4096, 512, 'high', 2458],
    [4096, 512, 'low', 39],
    [1, 1, 'low', 2],
    [2048, 2048, 'original', 4916],
    [2048, 2048, 'auto', 4916],
    [9600, 3200, 'original', 36000],
    [65536, 32, 'original', 2458],
    [131070, 64, 'auto', 2458],
  ] as const)('astra-patch/1: %s × %s / %s → %s', (width, height, detail, expected) => {
    expect(tokens('astra-patch/1', width, height, detail)).toBe(expected)
  })

  it('astra-patch/1 refuses excess processed patches and invalid dimensions', () => {
    expect(tokens('astra-patch/1', 9601, 3200, 'original')).toBeNull()
    expect(tokens('astra-patch/1', 9601, 3200, 'auto')).toBeNull()
    expect(tokens('astra-patch/1', 9601, 3200, 'high')).toBeLessThanOrEqual(3000)
    for (const [width, height] of [[0, 1], [-1, 1], [1.5, 1], [Number.NaN, 1], [Infinity, 1]] as const)
      expect(tokens('astra-patch/1', width, height, 'high')).toBeNull()
  })

  it.each([
    [2048, 1536, 'low', 231],
    [2048, 1536, 'high', 2942],
    [2048, 1536, 'original', 3687],
    [2048, 1536, 'auto', 3687],
    [4096, 512, 'high', 615],
    [65536, 32, 'original', 2458],
    [65536, 32, 'high', 77],
  ] as const)('gpt56-patch/1: %s × %s / %s → %s', (width, height, detail, expected) => {
    expect(tokens('gpt56-patch/1', width, height, detail)).toBe(expected)
  })

  it.each([
    [65, 65, 11],
    [1024, 1024, 1229],
    [2049, 2903, 7098],
    [9601, 3200, 36120],
    [131070, 64, 9831],
  ] as const)('sol-luna-auto-proxy/1: %s × %s → %s, without borrowing Astra caps', (width, height, expected) => {
    expect(tokens('sol-luna-auto-proxy/1', width, height, 'auto')).toBe(expected)
  })

  it('sol-luna-auto-proxy/1 accepts only auto and refuses unsafe arithmetic', () => {
    for (const detail of ['low', 'high', 'original'] as const)
      expect(tokens('sol-luna-auto-proxy/1', 1024, 1024, detail)).toBeNull()
    expect(tokens('sol-luna-auto-proxy/1', 4294967295, 4294967295, 'auto')).toBeNull()
  })
})

type Measured = ReturnType<ModelInputMeter['measure']>

/** Plans the request on the record binding and measures the planned representation. */
async function planAndMeasure(
  record: OpenAiRecord,
  parts: RequestParts,
  change: (representation: MeterRepresentation) => MeterRepresentation = value => value,
): Promise<Readonly<{ measured: Measured; tokenInput: JsonValue }>> {
  const binding = await bindingOf(record)
  const profile = officialProfile(record)
  const request = fixedRequest(record, parts)
  const planned = binding.rules.plan({ profile, supplier: supplierOf(record), assembled: assembledOf(request) })
  if (!('ok' in planned)) throw new Error(`plan: ${JSON.stringify(planned.failure)}`)
  const representation = change(planned.ok.representation)
  const measured = binding.meter.measure({
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

const SOL = recordNamed('openai/gpt-5.6-sol')
const ASTRA = recordNamed('openai/gpt-6-astra')
const o200k = getEncoding('o200k_base')

describe('measure', () => {
  it('estimates the visible projection with the o200k proxy and the configured margin', async () => {
    const { measured, tokenInput } = await planAndMeasure(SOL, {
      system: [textBlock('s1', 'instruction')],
      messages: [message('u1', 'user', [textBlock('b1', 'hello <|endoftext|> world')])],
      parameters: [{ kind: 'max-output-tokens', value: '128' }],
    })
    if (!('ok' in measured)) throw new Error(JSON.stringify(measured.failure))
    const amount = o200k.encode(writeJsonText(tokenInput), [], []).length
    expect(measured.ok.kind).toBe('complete')
    expect(measured.ok.counting).toHaveLength(1)
    expect(measured.ok.checks).toEqual([
      {
        supplier: supplierOf(SOL).adoption,
        metric: 'input-tokens',
        subject: 'request',
        measurement: {
          kind: 'estimate',
          amount: String(amount),
          margin: String(Math.ceil(amount / 10)),
          method: componentAdoption(SOL, 'meter'),
          marginSource: MARGIN_SOURCE,
        },
        limit: '922000',
        constraint: {
          profile: officialProfile(SOL).adoption,
          upstream: { kind: 'finite', amount: '922000', source: componentAdoption(SOL, 'evidence') },
        },
      },
    ])
    expect(writeJsonText(tokenInput)).toContain('"role":"developer"')
  })

  // Sealed openai-encrypted-input.spec.ts:127-197: complete and mixed encrypted history.
  it.each([
    'openai/gpt-5.6-sol',
    'openai/gpt-5.6-sol-pro',
    'openai/gpt-5.6-terra',
    'openai/gpt-5.6-terra-pro',
    'openai/gpt-5.6-luna',
    'openai/gpt-5.6-luna-pro',
  ])('%s has no estimate for carried encrypted reasoning and never tokenizes it', async name => {
    const record = recordNamed(name)
    const payload = JSON.stringify({ type: 'reasoning.encrypted', format: 'openai-responses-v1', data: 'fixture-only-ciphertext' })
    for (const mixed of [false, true]) {
      const blocks = mixed ? [textBlock('t1', 'Visible answer.'), stateBlock('s1', payload)] : [stateBlock('s1', payload)]
      const { measured, tokenInput } = await planAndMeasure(record, {
        messages: [
          message('u1', 'user', [textBlock('b1', 'hello')]),
          message('a1', 'assistant', blocks, {
            replay: { scope: `openrouter/${name}`, format: 'openai-responses-v1', at: [mixed ? 1 : 0] },
          }),
          message('u2', 'user', [textBlock('b2', 'next')]),
        ],
      })
      expect(measured).toEqual({
        failure: { kind: 'unavailable', dependency: '@omne-harness/pi-ai-openai', diagnostic: 'encrypted-reasoning-not-countable' },
      })
      expect(writeJsonText(tokenInput)).not.toContain('fixture-only-ciphertext')
    }
  })

  // Sealed openai-encrypted-input.spec.ts:199-229: visible reasoning keeps an estimate.
  it('estimates history whose reasoning is visible thinking only', async () => {
    const { measured, tokenInput } = await planAndMeasure(SOL, {
      messages: [
        message('u1', 'user', [textBlock('b1', 'hello')]),
        message('a1', 'assistant', [thinkingBlock('k1', 'Consider the visible facts.'), textBlock('t1', 'Answer.')], {
          replay: { scope: 'openrouter/openai/gpt-5.6-sol', format: 'openai-responses-v1', at: [] },
        }),
        message('u2', 'user', [textBlock('b2', 'next')]),
      ],
    })
    expect('ok' in measured).toBe(true)
    expect(writeJsonText(tokenInput)).toContain('"reasoning":"Consider the visible facts."')
  })

  it('an inline image without a measurement fact has no estimate', async () => {
    const { measured } = await planAndMeasure(ASTRA, {
      messages: [message('u1', 'user', [textBlock('b1', 'look'), imageBlock('i1')])],
    })
    expect(measured).toEqual({
      failure: { kind: 'unavailable', dependency: '@omne-harness/pi-ai-openai', diagnostic: 'image-measurement-missing' },
    })
  })

  const reference = { storage: 'test', key: 'image-1', mediaType: 'image/png', bytes: '1000', digest: 'd' }
  const fact = { reference, bytes: '1000', mediaType: 'image/png', kind: 'image', widthPixels: '1024', heightPixels: '1024' } as const

  it('adds the record image rule per measured image and checks each image size exactly', async () => {
    const parts = { messages: [message('u1', 'user', [textBlock('b1', 'look'), imageBlock('i1')])] }
    const { measured, tokenInput } = await planAndMeasure(ASTRA, parts, value => ({ ...value, media: [fact] }))
    if (!('ok' in measured)) throw new Error(JSON.stringify(measured.failure))
    const [input, image] = measured.ok.checks
    const text = o200k.encode(writeJsonText(tokenInput), [], []).length
    expect(input?.measurement).toMatchObject({ kind: 'estimate', amount: String(text + 1229) })
    expect(image).toMatchObject({
      metric: 'image-bytes',
      subject: 'image-1',
      measurement: { kind: 'exact', amount: '1000', method: componentAdoption(ASTRA, 'media') },
      limit: '4194304',
      constraint: { upstream: { kind: 'unknown' } },
    })
  })

  it('an image the rule does not cover is unsupported, never a guess', async () => {
    const luna = recordNamed('openai/gpt-6-luna')
    const parts = { messages: [message('u1', 'user', [imageBlock('i1')])] }
    const { measured } = await planAndMeasure(luna, parts, value => ({
      ...value,
      media: [{ ...fact, widthPixels: '4294967295', heightPixels: '4294967295' }],
    }))
    expect(measured).toEqual({
      failure: { kind: 'unsupported', field: 'image 0', adapter: componentAdoption(luna, 'media') },
    })
  })

  it('refuses a representation of another adoption or with media still pending', async () => {
    const parts = { messages: [message('u1', 'user', [textBlock('b1', 'hi')])] }
    const other = await planAndMeasure(SOL, parts, value => ({ ...value, adoption: componentAdoption(ASTRA, 'representation') }))
    expect(other.measured).toEqual({
      failure: { kind: 'unsupported', field: 'representation', adapter: componentAdoption(SOL, 'meter') },
    })
    const pending = await planAndMeasure(SOL, parts, value => ({
      adoption: value.adoption,
      tokenInput: value.tokenInput,
      media: [],
      kind: 'pending-media',
      references: [reference],
    }))
    expect(pending.measured).toEqual({
      failure: { kind: 'unsupported', field: 'representation.kind', adapter: componentAdoption(SOL, 'meter') },
    })
  })
})
