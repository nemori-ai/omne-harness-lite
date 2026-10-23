// The meter: the 28-pixel patch rule with the sealed goldens, the legacy Claude BPE loaded through
// tokenizer-tiktoken against the independent reference, the NFKC estimate of the visible
// projection with the configured margin, and the requests that have no estimate.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Tiktoken } from 'js-tiktoken/lite'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { MeterRepresentation, ModelInputMeter } from '@omne-harness/model-contract'
import { anthropicTokenizerResources, type AnthropicRecord } from '@omne-harness/pi-ai-anthropic'
import { createTiktokenTokenizer } from '@omne-harness/tokenizer-tiktoken'
import { componentAdoption } from '../src/adoptions.ts'
import { IMAGE_RULES } from '../src/images.ts'
import { claudeRanksOf, TokenizerResourceError } from '../src/tokenizer.ts'
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
} from './support/anthropic.ts'

const CLAUDE_JSON = new URL(
  '../resources/tokenizers/anthropic-legacy/claude.json',
  import.meta.url,
)

const patch = IMAGE_RULES['claude-patch-28/1']

describe('claude-patch-28/1 (sealed input-meters/anthropic.ts:54-79)', () => {
  it.each([
    // anthropic-family-current.spec.ts:718-744: 128x96 is 5x4 patches, 64x48 is 3x2.
    [128, 96, 20],
    [64, 48, 6],
    // anthropic-input-meter.spec.ts:343-367: the published 1920x1080 example.
    [1920, 1080, 2691],
    [1, 1, 1],
    [2576, 1, 92],
    [2576, 1456, 4784],
  ] as const)('%s × %s fits: ceil(w/28) × ceil(h/28) = %s', (width, height, expected) => {
    expect(patch({ width, height })).toBe(expected)
  })

  it.each([
    // The square fits at most 69 × 69 patches: the long edge shrinks to 1932.
    [3000, 3000, 4761],
    // 2:1 shrinks to the 2576 edge: 92 × 46.
    [5152, 2576, 4232],
    [2576, 5152, 4232],
    // One edge over 2576 alone.
    [2577, 28, 92],
  ] as const)(
    '%s × %s does not fit: the largest fitting long edge gives %s',
    (width, height, expected) => {
      expect(patch({ width, height })).toBe(expected)
    },
  )

  it('refuses dimensions that are not positive safe integers', () => {
    for (const [width, height] of [
      [0, 1],
      [-1, 1],
      [1.5, 1],
      [Number.NaN, 1],
      [Infinity, 1],
      [1, 2 ** 53],
    ] as const)
      expect(patch({ width, height })).toBeNull()
  })
})

describe('the tokenizer resources', () => {
  const independent = (): Tiktoken => {
    const parsed: unknown = JSON.parse(readFileSync(CLAUDE_JSON, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) throw new Error('claude.json')
    const patStr: unknown = Reflect.get(parsed, 'pat_str')
    const bpeRanks: unknown = Reflect.get(parsed, 'bpe_ranks')
    if (typeof patStr !== 'string' || typeof bpeRanks !== 'string') throw new Error('claude.json')
    return new Tiktoken({ pat_str: patStr, bpe_ranks: bpeRanks, special_tokens: {} })
  }

  it('load through tokenizer-tiktoken and match the @anthropic-ai/tokenizer 0.0.4 reference', () => {
    // Sealed tests/fixtures/anthropic/reference-input.json: the projected JSON of its body.
    const reference =
      '{"messages":[{"role":"system","content":[{"type":"text","text":"Read the weather."}]},{"role":"user","content":[{"type":"text","text":"What is it?"}]},{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"weather","arguments":"{\\"city\\":\\"Paris\\"}"}}]},{"role":"tool","tool_call_id":"call_1","content":"Sunny, 22 C"},{"role":"user","content":[{"type":"text","text":"Tomorrow?"}]}],"tools":[{"type":"function","function":{"name":"weather","description":"Read forecasts","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}}]}'
    const created = createTiktokenTokenizer(anthropicTokenizerResources())
    if (!('ok' in created)) throw new Error(JSON.stringify(created.failure))
    expect(created.ok.count([{ kind: 'text', text: reference }])).toEqual({ ok: { tokens: '150' } })
  })

  it('count special-token text as ordinary text, as the independent engine does', () => {
    const created = createTiktokenTokenizer(anthropicTokenizerResources())
    if (!('ok' in created)) throw new Error(JSON.stringify(created.failure))
    const text = 'before <EOT> after <META>'
    expect(created.ok.count([{ kind: 'text', text }])).toEqual({
      ok: { tokens: String(independent().encode(text, [], []).length) },
    })
    expect(created.ok.count([{ kind: 'special-token', name: '<EOT>' }])).toEqual({
      failure: { kind: 'unsupported-token', name: '<EOT>' },
    })
  })

  it('refuse bytes that are not the packaged file', () => {
    const bytes = readFileSync(CLAUDE_JSON)
    expect(() => claudeRanksOf(bytes)).not.toThrow()
    const changed = Uint8Array.from(bytes)
    changed[changed.length - 2] = 0x20
    expect(() => claudeRanksOf(changed)).toThrow(TokenizerResourceError)
  })
})

type Measured = ReturnType<ModelInputMeter['measure']>

/** Plans the request on the record binding and measures the planned representation. */
async function planAndMeasure(
  record: AnthropicRecord,
  parts: RequestParts,
  change: (representation: MeterRepresentation) => MeterRepresentation = value => value,
): Promise<Readonly<{ measured: Measured; tokenInput: JsonValue }>> {
  const binding = await bindingOf(record)
  const profile = officialProfile(record)
  const request = fixedRequest(record, parts)
  const planned = binding.rules.plan({
    profile,
    supplier: supplierOf(record),
    assembled: assembledOf(request),
  })
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

const SONNET = recordNamed('anthropic/claude-sonnet-5')
const claude = (() => {
  const created = createTiktokenTokenizer(anthropicTokenizerResources())
  if (!('ok' in created)) throw new Error(JSON.stringify(created.failure))
  return created.ok
})()

function tokensOf(tokenInput: JsonValue): number {
  const counted = claude.count([
    { kind: 'text', text: writeJsonText(tokenInput).normalize('NFKC') },
  ])
  if (!('ok' in counted)) throw new Error(JSON.stringify(counted.failure))
  return Number(counted.ok.tokens)
}

const reference = {
  storage: 'test',
  key: 'image-1',
  mediaType: 'image/png',
  bytes: '1000',
  digest: 'd',
}
const fact = {
  reference,
  bytes: '1000',
  mediaType: 'image/png',
  kind: 'image',
  widthPixels: '1920',
  heightPixels: '1080',
} as const

describe('measure', () => {
  it('estimates the NFKC form of the visible projection with the configured margin', async () => {
    const { measured, tokenInput } = await planAndMeasure(SONNET, {
      system: [textBlock('s1', 'instruction')],
      messages: [message('u1', 'user', [textBlock('b1', 'ＡＢＣ hello <EOT> world')])],
      parameters: [{ kind: 'max-output-tokens', value: '128' }],
    })
    if (!('ok' in measured)) throw new Error(JSON.stringify(measured.failure))
    const amount = tokensOf(tokenInput)
    expect(writeJsonText(tokenInput)).toBe(
      '{"messages":[{"role":"system","content":[{"type":"text","text":"instruction"}]},{"role":"user","content":[{"type":"text","text":"ＡＢＣ hello <EOT> world"}]}],"tools":[]}',
    )
    expect(measured.ok.kind).toBe('complete')
    expect(measured.ok.counting).toHaveLength(1)
    expect(measured.ok.checks).toEqual([
      {
        supplier: supplierOf(SONNET).adoption,
        metric: 'input-tokens',
        subject: 'request',
        measurement: {
          kind: 'estimate',
          amount: String(amount),
          margin: String(Math.ceil(amount / 10)),
          method: componentAdoption(SONNET, 'meter'),
          marginSource: MARGIN_SOURCE,
        },
        limit: '872000',
        constraint: { profile: officialProfile(SONNET).adoption, upstream: { kind: 'unknown' } },
      },
    ])
    // NFKC: the full-width letters count as ASCII letters.
    expect(amount).toBeLessThan(
      Number(
        (() => {
          const raw = claude.count([{ kind: 'text', text: writeJsonText(tokenInput) }])
          return 'ok' in raw ? raw.ok.tokens : '0'
        })(),
      ),
    )
  })

  // Sealed anthropic-input-meter.spec.ts:296-341: replayed reasoning is not visible BPE.
  it('has no estimate for a carried signed group and never tokenizes it', async () => {
    const payload = JSON.stringify([
      {
        format: 'anthropic-claude-v1',
        index: 0,
        signature: 'fixture-only-signature',
        text: 'signed thinking',
        type: 'reasoning.text',
      },
    ])
    const { measured, tokenInput } = await planAndMeasure(SONNET, {
      messages: [
        message('u1', 'user', [textBlock('b1', 'hello')]),
        message(
          'a1',
          'assistant',
          [thinkingBlock('k1', 'signed thinking'), textBlock('t1', 'Answer.'), stateBlock('s1', payload, ['k1'])],
          { replay: { scope: 'openrouter/anthropic/claude-sonnet-5', format: 'anthropic-claude-v1', at: [2] } },
        ),
        message('u2', 'user', [textBlock('b2', 'next')]),
      ],
    })
    expect(measured).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: '@omne-harness/pi-ai-anthropic',
        diagnostic: 'signed-reasoning-not-countable',
      },
    })
    expect(writeJsonText(tokenInput)).not.toContain('fixture-only-signature')
  })

  it('an inline image without a measurement fact has no estimate', async () => {
    const { measured } = await planAndMeasure(SONNET, {
      messages: [message('u1', 'user', [textBlock('b1', 'look'), imageBlock('i1')])],
    })
    expect(measured).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: '@omne-harness/pi-ai-anthropic',
        diagnostic: 'image-measurement-missing',
      },
    })
  })

  it('adds the patch rule per measured image and checks each image size exactly', async () => {
    const parts = { messages: [message('u1', 'user', [textBlock('b1', 'look'), imageBlock('i1')])] }
    const { measured, tokenInput } = await planAndMeasure(SONNET, parts, value => ({
      ...value,
      media: [fact],
    }))
    if (!('ok' in measured)) throw new Error(JSON.stringify(measured.failure))
    expect(writeJsonText(tokenInput)).toContain('{"type":"image_url","image_url":{"url":"[image]"}}')
    const [input, image] = measured.ok.checks
    expect(input?.measurement).toMatchObject({
      kind: 'estimate',
      amount: String(tokensOf(tokenInput) + 2691),
    })
    expect(image).toMatchObject({
      metric: 'image-bytes',
      subject: 'image-1',
      measurement: { kind: 'exact', amount: '1000', method: componentAdoption(SONNET, 'media') },
      limit: '4194304',
      constraint: { upstream: { kind: 'unknown' } },
    })
  })

  it('an image the rule does not cover is unsupported, never a guess', async () => {
    const parts = { messages: [message('u1', 'user', [imageBlock('i1')])] }
    for (const changed of [
      { ...fact, mediaType: 'image/bmp' },
      { ...fact, widthPixels: '9007199254740993' },
    ]) {
      const { measured } = await planAndMeasure(SONNET, parts, value => ({
        ...value,
        media: [changed],
      }))
      expect(measured).toEqual({
        failure: {
          kind: 'unsupported',
          field: 'image 0',
          adapter: componentAdoption(SONNET, 'media'),
        },
      })
    }
  })

  it('refuses a representation of another adoption or with media still pending', async () => {
    const parts = { messages: [message('u1', 'user', [textBlock('b1', 'hi')])] }
    const opus = recordNamed('anthropic/claude-opus-5')
    const other = await planAndMeasure(SONNET, parts, value => ({
      ...value,
      adoption: componentAdoption(opus, 'representation'),
    }))
    expect(other.measured).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'representation',
        adapter: componentAdoption(SONNET, 'meter'),
      },
    })
    const pending = await planAndMeasure(SONNET, parts, value => ({
      adoption: value.adoption,
      tokenInput: value.tokenInput,
      media: [],
      kind: 'pending-media',
      references: [reference],
    }))
    expect(pending.measured).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'representation.kind',
        adapter: componentAdoption(SONNET, 'meter'),
      },
    })
  })
})
