import { beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  readJsonStrict,
  writeJsonLossless,
  judgeContentBlock,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import { copyInputCalibration } from '@omne-harness-lite/model-response'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createMoonshotInputMeter } from '../src/input-meters/moonshot.ts'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { openaiDefinitions } from '../src/official-models/openai.ts'
import { createPiAiTransport } from '../src/index.ts'
import otherBefore from './fixtures/moonshot/other-official-before-empty-text.json' with { type: 'json' }
import { planRequest, type PlannedRequest } from '../src/plan.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import { directFull } from './direct-full-input.ts'
import { testImagePreparerFor } from './image-transport-support.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { at, certificate, fixture, judgedMessage, message, policy } from './support.ts'
import {
  moonshotModels,
  moonshotDefinition,
  moonshotRequest,
  moonshotReply,
  visible,
} from './moonshot-support.ts'
import old from './fixtures/moonshot/before-empty-text-mp4-18.json' with { type: 'json' }

let image: Extract<ContentBlock, { kind: 'image' }>
beforeAll(async () => {
  const bytes = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#d64541' },
  })
    .png()
    .toBuffer()
  const result = judgeContentBlock({
    id: 'image',
    kind: 'image',
    mediaType: 'image/png',
    data: { inline: bytes.toString('base64') },
    visibility: visible,
  })
  if (!('ok' in result) || result.ok.kind !== 'image') throw new Error('invalid image fixture')
  image = result.ok
})
const text = (value: string, id = 'text'): Extract<ContentBlock, { kind: 'text' }> => {
  const result = judgeContentBlock({ id, kind: 'text', text: value, visibility: visible })
  if (!('ok' in result) || result.ok.kind !== 'text') throw new Error('invalid text fixture')
  return result.ok
}
function requestFor(
  model: (typeof moonshotModels)[number],
  blocks: readonly ContentBlock[],
  type = 'user',
): PlanInput {
  return {
    ...moonshotRequest(model),
    messages: [judgedMessage({ ...message(type, '', 'user'), blocks })],
  }
}
async function planned(request: PlanInput, definition: ModelDefinition): Promise<PlannedRequest> {
  const result = await planRequest(
    request,
    [definition],
    createMoonshotInputMeter(definition),
    { signal: new AbortController().signal },
    testImagePreparerFor(planRequest),
  )
  if (!('planned' in result)) throw new Error(JSON.stringify(result))
  return result.planned
}
function contentOf(plan: PlannedRequest) {
  return JSON.parse(plan.serialized).messages[0].content
}

describe.each(moonshotModels)('$modelId exact empty-text planning', model => {
  const definition = moonshotDefinition(model)
  it.each(['image-first', 'image-last', 'multiple'] as const)(
    'removes mixed empty text: %s; owns input and final meter/body',
    async order => {
      const blocks =
        order === 'image-first'
          ? [image, text('')]
          : order === 'image-last'
            ? [text(''), image]
            : [text('', 'e1'), image, text('kept', 't1'), text('', 'e2'), text(' ', 'space')]
      const request = requestFor(model, blocks)
      const before = writeJsonLossless(request)
      const plan = await planned(request, definition)
      expect(writeJsonLossless(request)).toBe(before)
      const content = contentOf(plan)
      expect(
        content.map((part: { type: string; text?: string }) =>
          part.type === 'text' ? part.text : part.type,
        ),
      ).toEqual(order === 'multiple' ? ['image_url', 'kept', ' '] : ['image_url'])
      const independent = directFull(createMoonshotInputMeter(definition), {
        body: plan.body,
        serialized: plan.serialized,
      })
      expect(independent).toMatchObject({
        kind: 'estimated',
        tokens: plan.measurement.predictedInput,
      })
      expect(plan.requestInput).toMatchObject({
        kind: 'known',
        projectionRevision: 'openrouter-input-projection/3',
        countingBasis: {
          binding: { implementation: { name: 'pi-ai:moonshot', revision: 'mp4-19' } },
        },
      })
    },
  )
  it('keeps nonempty parts in order and omits all empty text from text-only mixtures', async () => {
    const result = await planned(
      requestFor(model, [
        text('', 'e1'),
        text('A', 'a'),
        text('', 'e2'),
        text('B', 'b'),
        text('\n', 'newline'),
      ]),
      definition,
    )
    expect(contentOf(result)).toEqual([
      { type: 'text', text: 'A' },
      { type: 'text', text: 'B' },
      { type: 'text', text: '\n' },
    ])
  })
  it.each([{ values: [''] }, { values: ['', ''] }, { values: [' ', '\n'] }, { values: [] }])(
    'preserves an all-empty, whitespace or empty array $values',
    async ({ values }) => {
      const result = await planned(
        requestFor(
          model,
          values.map((value, index) => text(value, `part-${index}`)),
        ),
        definition,
      )
      expect(contentOf(result)).toEqual(values.map(value => ({ type: 'text', text: value })))
    },
  )
  it.each(['system', 'system_reminder', 'compaction'])(
    'applies after %s markers; caller blocks remain unchanged',
    async type => {
      const request = requestFor(
        model,
        type === 'system' ? [text('system', 'nonempty'), text('')] : [text('')],
        type,
      )
      const before = writeJsonLossless(request)
      const result = await planned(request, definition)
      expect(contentOf(result)).toEqual([
        { type: 'text', text: type === 'system' ? 'system' : `[${type} "user"]` },
      ])
      expect(JSON.parse(result.serialized).messages[0].role).toBe(
        type === 'system' ? 'system' : 'user',
      )
      expect(writeJsonLossless(request)).toBe(before)
    },
  )
  it.each([false, true])(
    'retains real old input facts; synthetic observation emptyTail=%s',
    async emptyTail => {
      const row = old.cases.find(
        row => row.modelId === model.modelId && row.emptyTail === emptyTail,
      )
      if (!row) throw new Error('old input fixture missing')
      const parsed = readJsonStrict(row.requestInputJson)
      if (!('ok' in parsed)) throw new Error('old input fixture invalid')
      // Only requestInput is an actual old planner result. The usage and observation below
      // are explicitly synthetic and make no upstream or billing claim.
      const calibration = copyInputCalibration({
        requestInput: parsed.ok,
        observedInput: {
          kind: 'upstream_total',
          tokens: 100,
          provenance: {
            adapterRevision: 'openrouter-usage-reader/2',
            fieldPaths: ['usage.prompt_tokens'],
          },
        },
        outputGroup: {
          kind: 'known',
          projectionRevision: 'openrouter-input-projection/3',
          source: 'none',
          completeness: 'complete',
          usageRef: 'usage',
          blockDigests: [],
        },
      })
      if (!('ok' in calibration)) throw new Error(JSON.stringify(calibration))
      const blocks = [
        text('A local unchanged prefix.', 'old-visible'),
        ...(emptyTail ? [text('', 'old-empty')] : []),
      ]
      const request: PlanInput = {
        ...moonshotRequest(model),
        messages: [judgedMessage({ type: 'user', id: 'old-local-user', createdAt: at, blocks })],
        calibration: {
          kind: 'observation',
          inputCalibration: calibration.ok,
          usage: {
            input_tokens: 'unknown',
            output_tokens: 4,
            cache_read_tokens: 'unknown',
            cache_write_tokens: 'unknown',
            source: 'upstream',
          },
          outputBlocks: [],
          replaySelection: [],
        },
      }
      const result = await planned(request, definition)
      if (emptyTail) expect(result.serialized).not.toBe(row.serialized)
      else expect(result.serialized).toBe(row.serialized)
      expect(result.measurement).toMatchObject({
        mode: 'full',
        fallbackReason: emptyTail ? 'prefix_changed' : 'basis_changed',
      })
      expect(calibration.ok.requestInput).toMatchObject({
        kind: 'known',
        countingBasis: { binding: { implementation: { revision: 'mp4-18' } } },
      })
    },
  )
  it('keeps a visible nonempty transcript while omitting its neighbouring empty text', async () => {
    const rendered = {
      ...image,
      transcript: 'Visible transcript.',
      renderings: [
        { producedBy: 'system' as const, blocks: [text('Rendered content.', 'rendered-text')] },
      ],
    }
    const result = await planned(requestFor(model, [text(''), rendered]), definition)
    expect(contentOf(result)).toEqual([{ type: 'text', text: 'Visible transcript.' }])
  })
  it('rejects an old current binding and its old meter factory', async () => {
    const retired = {
      ...definition,
      implementation: { ...definition.implementation, revision: 'mp4-18' },
    }
    expect(() => createMoonshotInputMeter(retired)).toThrow(TypeError)
    const current = requestFor(model, [text('A'), text('', 'empty')])
    const request = {
      ...current,
      snapshot: {
        ...current.snapshot,
        adaptation: { ...current.snapshot.adaptation, implementation: retired.implementation },
      },
    }
    expect(
      await planRequest(request, [definition], createMoonshotInputMeter(definition), {
        signal: new AbortController().signal,
      }),
    ).toEqual({ rejected: 'unavailable' })
  })
})

it.each(['model', 'provider', 'definition', 'implementation-name', 'implementation-revision'])(
  'does not match a similar custom %s coordinate',
  async field => {
    const model = moonshotModels[0]
    const original = moonshotDefinition(model)
    const provider = field === 'provider' ? `${model.provider}-custom` : model.provider
    const route = original.routes[model.provider]
    if (!route) throw new Error('route missing')
    const definition: ModelDefinition = {
      ...original,
      modelId: field === 'model' ? `${original.modelId}-custom` : original.modelId,
      revision: field === 'definition' ? 'custom-3' : original.revision,
      implementation: {
        name: field === 'implementation-name' ? 'custom:moonshot' : original.implementation.name,
        revision:
          field === 'implementation-revision' ? 'mp4-190' : original.implementation.revision,
      },
      routes: { [provider]: route },
    }
    const profile = createOfficialProfileContent(definition, {
      providers: [provider],
      allowFallback: false,
      configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
    })
    if (!('ok' in profile)) throw new Error(JSON.stringify(profile))
    const base = requestFor(model, [image, text('')])
    const request = {
      ...base,
      routeName: definition.modelId,
      provider,
      snapshot: { ...base.snapshot, adaptation: profile.ok.adaptation, providers: [provider] },
    }
    const result = await planRequest(
      request,
      [definition],
      syntheticInputMeter(definition, provider),
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    if (!('planned' in result)) throw new Error(JSON.stringify(result))
    expect(
      contentOf(result.planned).map((part: { type: string; text?: string }) =>
        part.type === 'text' ? part.text : part.type,
      ),
    ).toEqual(['image_url', ''])
  },
)

it('preserves the image plus empty-text wire for another official leaf', async () => {
  const definition = openaiDefinitions[0]
  if (!definition) throw new Error('official leaf missing')
  const provider = Object.keys(definition.routes)[0]
  if (!provider) throw new Error('provider missing')
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if (!('ok' in profile)) throw new Error(JSON.stringify(profile))
  const base = requestFor(moonshotModels[0], [image, text('')])
  const request = {
    ...base,
    routeName: definition.modelId,
    provider,
    snapshot: {
      ...base.snapshot,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
    },
  }
  const result = await planRequest(
    request,
    [definition],
    createOpenAiInputMeter(definition),
    { signal: new AbortController().signal },
    testImagePreparerFor(planRequest),
  )
  if (!('planned' in result)) throw new Error(JSON.stringify(result))
  expect(result.planned.serialized).toBe(otherBefore.serialized)
  expect(
    contentOf(result.planned).map((part: { type: string; text?: string }) =>
      part.type === 'text' ? part.text : part.type,
    ),
  ).toEqual(['image_url', ''])
})

it.each(moonshotModels)(
  '$modelId sends the fixed filtered body through actual public invoke/TLS',
  async model => {
    const cert = certificate()
    const definition = moonshotDefinition(model)
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.end(moonshotReply(model, 1))
      },
      {},
      undefined,
      [definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createMoonshotInputMeter(definition)],
    })
    try {
      const request = requestFor(model, [text(''), image])
      const result = await transport.plan(request, { signal: new AbortController().signal })
      if (!('planned' in result)) throw new Error(JSON.stringify(result))
      const outcome = await invokeModel({
        ...request,
        transport,
        credential: 'controlled-local-only',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      expect(outcome).toMatchObject({ outcome: 'complete' })
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(result.planned.serialized)
      expect(contentOf(result.planned)).toHaveLength(1)
      expect(contentOf(result.planned)[0].type).toBe('image_url')
    } finally {
      await transport.close()
      await host.close()
      cert.dispose()
    }
  },
)
