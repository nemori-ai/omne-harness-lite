// Google revision 4 GS-V1 (finite table and factory coordinates) and GS-V2 (detail domain).
// GS-V2 fixtures are served over local TLS and read by the production reader; no merged
// detail entry is written by hand. Unit-level shapes the projection never produces are
// classified directly from reader output.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readOpaqueJson, type JsonObject } from '@omne-harness-lite/content-blocks'
import { projectAssistant } from '../src/assistant-projection.ts'
import { object } from '../src/json.ts'
import { planRequest } from '../src/plan.ts'
import {
  createGoogleHistoryInputMeter,
  createGoogleInputMeter,
} from '../src/input-meters/google.ts'
import {
  classifyGoogleUnit,
  googleDetailShape,
  GOOGLE_HISTORY_ALGORITHM,
} from '../src/input-meters/google-history-policy.ts'
import { googleDefinitions } from '../src/official-models/google.ts'
import {
  detailsDelta,
  encryptedDetail,
  googleHistoryDefinition,
  googleHistoryRelease,
  googleLeaves,
  googleReply,
  GOOGLE_FORMAT,
  GOOGLE_SERVING_PROVIDER,
  signatureDelta,
  syntheticCiphertext,
  textFragmentDelta,
  googleHistoryTool,
  type GoogleLeaf,
} from './fixtures/google/history.ts'
import { googleThreeRoundInput } from './fixtures/google/three-round.ts'
import {
  completed,
  followUp,
  googleHistoryRequest,
  openGoogleHost,
  refused,
  type GoogleHost,
} from './google-history-support.ts'
import { certificate } from './support.ts'

// The first test in a worker pays the verified tokenizer load and TLS setup.
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })

const V3 = {
  algorithm: 'gemma4-visible-text-tools-effort-offset6-2',
  tokenizer: 'tokenizer-basis/gemma4-visible-text-tools-effort-offset6-2',
  replay: 'unsupported-marginal/1',
  transform: 'openrouter-wire/2',
  projection: 'openrouter-input-projection/3',
}

function coordinates(meter: ReturnType<typeof createGoogleInputMeter>) {
  if (!meter) throw new Error('meter required')
  return {
    modelId: meter.modelId,
    definitionRevision: meter.definitionRevision,
    implementation: meter.implementation,
    provider: meter.provider,
    algorithmRevision: meter.algorithmRevision,
    tokenizerRevision: meter.tokenizerRevision,
    replayRevision: meter.replayRevision,
    transformRevision: meter.transformRevision,
  }
}

describe.each(googleLeaves)('GS-V1 finite table: $modelId', leaf => {
  const v3 = googleDefinitions.find(item => item.modelId === leaf.modelId)
  if (!v3) throw new Error('missing V3 declaration')
  const v4 = googleHistoryDefinition(leaf.modelId)

  it('exports the V3 (current build) and V4 (unpinned) factory coordinates field by field', async () => {
    const current = createGoogleInputMeter(v3)
    const candidate = createGoogleHistoryInputMeter(v4, googleHistoryRelease)
    expect(coordinates(current)).toEqual({
      modelId: leaf.modelId,
      definitionRevision: '3',
      implementation: { name: 'pi-ai:google', revision: 'mp4-17' },
      provider: 'google-ai-studio',
      algorithmRevision: V3.algorithm,
      tokenizerRevision: V3.tokenizer,
      replayRevision: V3.replay,
      transformRevision: V3.transform,
    })
    expect(coordinates(candidate)).toEqual({
      modelId: leaf.modelId,
      definitionRevision: googleHistoryRelease.definitionRevision,
      implementation: {
        name: 'pi-ai:google',
        revision: googleHistoryRelease.implementationRevision,
      },
      provider: 'google-ai-studio',
      algorithmRevision: 'gemma4-visible-offset6-complete-output-group-estimated/1',
      // K5: tokenizer and replay are not raised; the tokenizer is set explicitly.
      tokenizerRevision: V3.tokenizer,
      replayRevision: V3.replay,
      transformRevision: V3.transform,
    })
    expect(candidate?.tokenizerRevision).not.toBe(`tokenizer-basis/${GOOGLE_HISTORY_ALGORITHM}`)
    for (const id of ['gen-1790765022-soWzJ2kSKKIdOhKsWM7Z', 'gen-1790765039-T89IaeRcxSpJm8DIEXzO'])
      expect(candidate?.evidence).toContain(id)
    expect(candidate?.evidence).toContain('counted once')
    expect(candidate?.evidence).toContain('no error bound')
    // The projection coordinate is the one each meter writes into its saved basis.
    const v3Request = {
      ...googleThreeRoundInput(leaf.modelId, 'high', true),
      tools: [googleHistoryTool],
    }
    for (const [definition, meter, request] of [
      [v3, current, v3Request],
      [v4, candidate, googleHistoryRequest(leaf.modelId)],
    ] as const) {
      if (!meter) throw new Error('meter required')
      const planned = await planRequest(request, [definition], meter, {
        signal: new AbortController().signal,
      })
      if (!('planned' in planned)) throw new Error(JSON.stringify(planned))
      expect(planned.planned.requestInput).toMatchObject({
        kind: 'known',
        projectionRevision: V3.projection,
        countingBasis: {
          model: leaf.modelId,
          provider: 'google-ai-studio',
          meterRevision: meter.algorithmRevision,
          tokenizerRevision: V3.tokenizer,
          replayRevision: V3.replay,
          projectionRevision: V3.projection,
        },
      })
    }
  })

  it('refuses every coordinate outside the table and never reuses a retired row', () => {
    const release = googleHistoryRelease
    const refusedReleases: unknown[] = [
      { definitionRevision: '3', implementationRevision: 'mp4-17' },
      { definitionRevision: '3', implementationRevision: release.implementationRevision },
      { definitionRevision: release.definitionRevision, implementationRevision: 'mp4-17' },
      { definitionRevision: '2', implementationRevision: 'mp4-3' },
      { definitionRevision: '1', implementationRevision: 'mp4-2' },
      { definitionRevision: '', implementationRevision: release.implementationRevision },
      { ...release, extra: true },
      { definitionRevision: release.definitionRevision },
    ]
    for (const bad of refusedReleases)
      expect(
        // @ts-expect-error -- deliberately malformed releases from an untyped caller
        createGoogleHistoryInputMeter(v4, bad),
        JSON.stringify(bad),
      ).toBeUndefined()
    // The declaration must be the published one at exactly the release coordinates.
    for (const definition of [
      v3,
      { ...v4, revision: '5' },
      { ...v4, implementation: { name: 'pi-ai:google', revision: 'mp4-18' } },
      { ...v4, implementation: { name: 'pi-ai:xai', revision: release.implementationRevision } },
      { ...v4, capabilities: { ...v4.capabilities, maxInputTokens: 983039 } },
      { ...v4, routes: {} },
      { ...v4, modelId: 'google/gemini-3.9-flash' },
    ])
      expect(createGoogleHistoryInputMeter(definition, release)).toBeUndefined()
    expect(createGoogleInputMeter(v4)).toBeUndefined()
  })

  it('leaves the official catalog on V3 until the coordinates are pinned (K7)', () => {
    // GS-V1 "old factory deleted" is a publication step: it happens when the main line pins
    // definition/implementation after GS-V9 A. Until then V3 is the only official binding.
    expect(v3.revision).toBe('3')
    expect(v3.implementation).toEqual({ name: 'pi-ai:google', revision: 'mp4-17' })
    expect(createGoogleHistoryInputMeter(v3, googleHistoryRelease)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------
// GS-V2: the detail domain, through the production reader.

const data = (leaf: GoogleLeaf, seed = 'round-1') =>
  syntheticCiphertext(leaf.ciphertextBytes, `${leaf.modelId}-${seed}`)
const signature = syntheticCiphertext(252, 'google-09-28-signature')
const secondCall = 'call_local_parallel_2'

/** E of this leaf with members replaced, added or removed. */
function E(leaf: GoogleLeaf, change: JsonObject = {}, omit: readonly string[] = []): JsonObject {
  return Object.fromEntries(
    Object.entries({ ...encryptedDetail(data(leaf), leaf.callId), ...change }).filter(
      ([name]) => !omit.includes(name),
    ),
  )
}

interface Variant {
  readonly name: string
  readonly reasoning: (leaf: GoogleLeaf) => JsonObject[]
  /** Tool calls; `false` is the non-tool text path. Default: one call with the leaf's id. */
  readonly calls?: false | ((leaf: GoogleLeaf) => { id: string; arguments: string }[])
}

const oneE: Variant = {
  name: 'one E (the 2026-09-30 shape)',
  reasoning: leaf => [detailsDelta([E(leaf)])],
}
const inDomain: readonly Variant[] = [
  oneE,
  {
    name: 'two E for two parallel tool calls',
    reasoning: leaf => [
      detailsDelta([E(leaf), encryptedDetail(data(leaf, 'parallel'), secondCall, 1)]),
    ],
    calls: leaf => [
      { id: leaf.callId, arguments: '{"query":"CEDAR"}' },
      { id: secondCall, arguments: '{"query":"PINE"}' },
    ],
  },
  {
    name: 'one E streamed as two complete E fragments',
    reasoning: leaf => [
      detailsDelta([E(leaf)]),
      detailsDelta([E(leaf, { data: data(leaf, 'fragment-2') })]),
    ],
  },
]

const outOfDomain: readonly Variant[] = [
  { name: 'E without id', reasoning: leaf => [detailsDelta([E(leaf, {}, ['id'])])] },
  { name: 'E id null', reasoning: leaf => [detailsDelta([E(leaf, { id: null })])] },
  { name: 'E id empty', reasoning: leaf => [detailsDelta([E(leaf, { id: '' })])] },
  { name: 'E id number', reasoning: leaf => [detailsDelta([E(leaf, { id: 476730 })])] },
  {
    name: 'E data [REDACTED]',
    reasoning: leaf => [detailsDelta([E(leaf, { data: '[REDACTED]' })])],
  },
  { name: 'E data empty', reasoning: leaf => [detailsDelta([E(leaf, { data: '' })])] },
  { name: 'E data not a string', reasoning: leaf => [detailsDelta([E(leaf, { data: 748 })])] },
  { name: 'E without index', reasoning: leaf => [detailsDelta([E(leaf, {}, ['index'])])] },
  { name: 'E index string', reasoning: leaf => [detailsDelta([E(leaf, { index: '0' })])] },
  { name: 'E with signature', reasoning: leaf => [detailsDelta([E(leaf, { signature })])] },
  { name: 'E with text', reasoning: leaf => [detailsDelta([E(leaf, { text: 'thought' })])] },
  { name: 'E with an unknown member', reasoning: leaf => [detailsDelta([E(leaf, { extra: 1 })])] },
  {
    name: 'E of another format',
    reasoning: leaf => [detailsDelta([E(leaf, { format: 'unknown' })])],
  },
  {
    name: 'E mixed with an E of another format',
    reasoning: leaf => [
      detailsDelta([
        E(leaf),
        { ...encryptedDetail(data(leaf, 'mixed'), secondCall, 1), format: 'openai-responses-v1' },
      ]),
    ],
    calls: leaf => [
      { id: leaf.callId, arguments: '{"query":"CEDAR"}' },
      { id: secondCall, arguments: '{"query":"PINE"}' },
    ],
  },
  {
    name: 'E + T',
    reasoning: leaf => [detailsDelta([E(leaf)]), textFragmentDelta('Considering the code.')],
  },
  {
    name: 'E + TS',
    reasoning: leaf => [
      detailsDelta([E(leaf)]),
      textFragmentDelta('Considering the code.'),
      signatureDelta(signature),
    ],
  },
  {
    name: 'reasoning.summary',
    reasoning: () => [
      detailsDelta([
        {
          type: 'reasoning.summary',
          summary: 'Look up the code.',
          format: GOOGLE_FORMAT,
          index: 0,
        },
      ]),
    ],
  },
  // Non-tool path, 2026-09-28 fragment sequence, completed with `stop`.
  {
    name: 'T-only (K2 candidate a, GG-13)',
    reasoning: () => [textFragmentDelta('Considering '), textFragmentDelta('the code.')],
    calls: false,
  },
  {
    name: 'TS (text then signature-only fragment, merged by R-L)',
    reasoning: () => [textFragmentDelta('Considering the code.'), signatureDelta(signature)],
    calls: false,
  },
  { name: 'S only', reasoning: () => [signatureDelta(signature)], calls: false },
]

function reply(leaf: GoogleLeaf, variant: Variant): string {
  const calls =
    variant.calls === false
      ? []
      : (variant.calls?.(leaf) ?? [{ id: leaf.callId, arguments: '{"query":"CEDAR"}' }])
  return googleReply({
    modelId: leaf.modelId,
    generation: `gen-local-google-${variant.name.replace(/\W+/g, '-')}`,
    servingProvider: GOOGLE_SERVING_PROVIDER,
    reasoning: variant.reasoning(leaf),
    calls,
    usage: { prompt: leaf.prompt, output: leaf.output, reasoning: leaf.reasoning },
  })
}

function readerDetails(result: ReturnType<typeof completed>): unknown {
  const opaque = result.blocks.flatMap(block =>
    block.kind === 'thinking' && block.opaque !== undefined ? [readOpaqueJson(block.opaque)] : [],
  )
  if (opaque.length !== 1 || !object(opaque[0]))
    throw new Error('one opaque thinking block expected')
  return opaque[0].reasoning_details
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe.each(googleLeaves)('GS-V2 detail domain through the reader: $modelId', leaf => {
  let host: GoogleHost
  beforeAll(async () => {
    host = await openGoogleHost(cert.tls, leaf.modelId)
  })
  afterAll(async () => {
    await host.close()
  })

  async function secondRound(variant: Variant) {
    host.serve(reply(leaf, variant))
    const first = googleHistoryRequest(leaf.modelId)
    const result = completed(await host.invoke(first))
    const projected = projectAssistant(result.blocks, leaf.modelId, false)
    if ('rejected' in projected) throw new Error(projected.rejected)
    return { result, unit: projected.message, next: followUp(first, result, 2) }
  }

  it.each(inDomain)(
    '$name is a whole group and the next round plans full/estimated',
    async variant => {
      const { result, unit, next } = await secondRound(variant)
      // The reader keeps every E verbatim (id included) and in order; nothing is merged.
      const entries = variant
        .reasoning(leaf)
        .flatMap(delta => (Array.isArray(delta.reasoning_details) ? delta.reasoning_details : []))
      expect(readerDetails(result)).toEqual(entries)
      expect(entries.every(detail => googleDetailShape(detail) === 'encrypted')).toBe(true)
      expect(classifyGoogleUnit(unit)).toBe('wholeGroup')
      const before = host.requests.length
      const planned = await host.transport.plan(next, { signal: new AbortController().signal })
      if (!('planned' in planned)) throw new Error(JSON.stringify(planned))
      expect(planned.planned.measurement).toMatchObject({
        mode: 'full',
        precision: 'estimated',
        fullContribution: { precision: 'estimated' },
      })
      expect(host.requests).toHaveLength(before)
    },
  )

  it.each(outOfDomain)(
    '$name is uninterpretable and the next round is refused before HTTP',
    async variant => {
      const { unit, next } = await secondRound(variant)
      expect(Object.hasOwn(unit, 'reasoning_details')).toBe(true)
      expect(classifyGoogleUnit(unit)).toBe('uninterpretable')
      const before = host.requests.length
      expect(await host.transport.plan(next, { signal: new AbortController().signal })).toEqual(
        refused,
      )
      expect(await host.invoke(next)).toEqual(refused)
      expect(host.requests).toHaveLength(before)
    },
  )

  it('refuses a reader-produced E group in a non-assistant unit or beside a reasoning string', async () => {
    const { unit } = await secondRound(oneE)
    expect(classifyGoogleUnit(unit)).toBe('wholeGroup')
    // Shapes the projection never produces; the classifier still refuses them.
    expect(classifyGoogleUnit({ ...unit, role: 'user' })).toBe('uninterpretable')
    expect(classifyGoogleUnit({ ...unit, role: 'tool' })).toBe('uninterpretable')
    expect(classifyGoogleUnit({ ...unit, reasoning: '' })).toBe('uninterpretable')
    expect(classifyGoogleUnit({ ...unit, reasoning: 'plan' })).toBe('uninterpretable')
    expect(classifyGoogleUnit({ ...unit, reasoning_details: [] })).toBe('uninterpretable')
    expect(classifyGoogleUnit({ ...unit, reasoning_details: null })).toBe('uninterpretable')
    const { reasoning_details: _details, ...visible } = unit
    expect(classifyGoogleUnit(visible)).toBe('visible')
    expect(classifyGoogleUnit({ ...visible, reasoning: 'plain thinking' })).toBe('visible')
  })
})
