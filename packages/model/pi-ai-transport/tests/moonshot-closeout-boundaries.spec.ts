import { testImagePreparerFor } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp, { type Sharp } from 'sharp'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'
import {
  createMoonshotInputMeter,
  referenceMoonshotImageTokens,
} from '../src/input-meters/moonshot.ts'
import { moonshotTokenizer } from '../src/input-meters/moonshot-tokenizer.ts'
import { planRequest } from '../src/plan.ts'
import { at, certificate, fixture, judgedMessage, policy } from './support.ts'
import {
  MOONSHOT_SERVING_PROVIDER,
  moonshotDefinition,
  moonshotModels,
  moonshotReply,
  moonshotRequest,
  userTurn,
  visible,
  wireOf,
  type MoonshotModel,
} from './moonshot-support.ts'

// Current official bindings (definition 3 / mp4-18). Local fixtures only; no
// statement here is an OpenRouter or Moonshot upstream observation.
const [k3, k27] = moonshotModels

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

async function plan(request: PlanInput, model: MoonshotModel) {
  const definition = moonshotDefinition(model)
  return planRequest(
    request,
    [definition],
    createMoonshotInputMeter(definition),
    { signal: new AbortController().signal },
    testImagePreparerFor(planRequest),
  )
}

function withUser(model: MoonshotModel, effort: ModelRequestParameters['reasoningEffort']) {
  const request = moonshotRequest(model, { effort })
  return { ...request, messages: [...request.messages, userTurn(1)] }
}

async function invokeOnce(model: MoonshotModel, request: PlanInput) {
  const definition = moonshotDefinition(model)
  const host = await fixture(
    cert.tls,
    res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(moonshotReply(model, 1, { servingProvider: MOONSHOT_SERVING_PROVIDER }))
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
    const planned = await transport.plan(request, { signal: new AbortController().signal })
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    const result = await invokeModel({
      ...request,
      transport,
      credential: 'controlled-test-only',
      signal: new AbortController().signal,
      policy: policy(),
    }).outcome
    if (!('outcome' in result) || result.outcome !== 'complete')
      throw new Error(JSON.stringify(result))
    expect(host.requests).toHaveLength(1)
    expect(host.requests[0]?.body).toBe(planned.planned.serialized)
    const sent = wireOf(host.requests[0])
    const independent = directFull(createMoonshotInputMeter(definition), {
      body: sent.body,
      serialized: host.requests[0]?.body ?? '',
    })
    if (independent.kind !== 'estimated') throw new Error('estimate unavailable')
    expect(writeJsonLossless(planned.planned.measurement.predictedInput)).toBe(
      writeJsonLossless(independent.tokens),
    )
    return { planned: planned.planned, sent, tokens: Number(String(independent.tokens)) }
  } finally {
    await transport.close()
    await host.close()
  }
}

describe('Moonshot effort rules through the public invoke path', () => {
  it('K3 sends exactly low/high/max, drops medium/none, and counts the thinking-effort segment', async () => {
    const none = await invokeOnce(k3, withUser(k3, undefined))
    expect(none.sent.body).not.toHaveProperty('reasoning')
    for (const effort of ['low', 'high', 'max'] as const) {
      const selected = await invokeOnce(k3, withUser(k3, effort))
      expect(selected.sent.body.reasoning).toEqual({ effort })
      expect(selected.planned.droppedParameters ?? []).toEqual([])
      // The pinned K3 encoder renders a thinking_effort system segment for the effort.
      expect(selected.tokens).toBeGreaterThan(none.tokens)
    }
    for (const effort of ['medium', 'none'] as const) {
      const dropped = await invokeOnce(k3, withUser(k3, effort))
      expect(dropped.sent.body).not.toHaveProperty('reasoning')
      expect(dropped.planned.droppedParameters).toEqual(['reasoningEffort'])
      expect(dropped.tokens).toBe(none.tokens)
    }
  })

  it('K2.7 Code drops every explicit effort and its meter refuses a reasoning member', async () => {
    const none = await invokeOnce(k27, withUser(k27, undefined))
    for (const effort of ['none', 'low', 'medium', 'high', 'max'] as const) {
      const dropped = await invokeOnce(k27, withUser(k27, effort))
      expect(dropped.sent.body).not.toHaveProperty('reasoning')
      expect(dropped.planned.droppedParameters).toEqual(['reasoningEffort'])
      expect(dropped.tokens).toBe(none.tokens)
    }
    const forced = { ...none.sent.body, reasoning: { effort: 'high' } }
    expect(
      directFull(createMoonshotInputMeter(moonshotDefinition(k27)), {
        body: forced,
        serialized: writeJsonLossless(forced),
      }),
    ).toEqual({ kind: 'unavailable' })
  })
})

describe('Moonshot inline image reference estimate', () => {
  // Hand-derived from the pinned navit_resize_image parameters (patch 14, merge 2, no
  // resize below the side/patch limits): ceil(w/28) * ceil(h/28).
  const small = { width: 64, height: 48, patches: 3 * 2 }
  const large = { width: 128, height: 96, patches: 5 * 4 }
  const encoders = {
    'image/png': (image: Sharp) => image.png(),
    'image/jpeg': (image: Sharp) => image.jpeg({ quality: 90 }),
    'image/webp': (image: Sharp) => image.webp({ quality: 90 }),
  } as const
  async function bytes(mediaType: keyof typeof encoders, width: number, height: number) {
    const base = sharp({
      create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
    return encoders[mediaType](base).toBuffer()
  }

  it.each(
    moonshotModels.flatMap(model =>
      (['image/png', 'image/jpeg', 'image/webp'] as const).map(mediaType => ({
        model,
        mediaType,
      })),
    ),
  )('$model.modelId $mediaType follows the pinned processor', async ({ model, mediaType }) => {
    const route = model.k3 ? 'k3' : 'k27'
    expect(referenceMoonshotImageTokens(route, small.width, small.height)).toBe(small.patches)
    expect(referenceMoonshotImageTokens(route, large.width, large.height)).toBe(large.patches)
    const measure = async (size: typeof small) => {
      const request = moonshotRequest(model)
      const image = await bytes(mediaType, size.width, size.height)
      const planned = await plan(
        { ...request, messages: [...request.messages, userTurn(1, { bytes: image, mediaType })] },
        model,
      )
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.inputLimitEvidence.images).toBe(1)
      expect(planned.planned.inputLimitEvidence.imageBytes).toEqual([image.length])
      expect(planned.planned.serialized).toContain(
        `data:${mediaType};base64,${image.toString('base64')}`,
      )
      const measurement = planned.planned.measurement
      if (measurement.precision !== 'estimated') throw new Error('image estimate missing')
      return Number(String(measurement.predictedInput))
    }
    // K2.7 renders a constant `image` label; K3 renders `image {w}x{h}`, counted by the
    // pinned tokenizer, so only that label's token difference is added to the oracle.
    const label = (size: typeof small) =>
      moonshotTokenizer('k3').encode(`image ${size.width}x${size.height}`, [], []).length
    const header = model.k3 ? label(large) - label(small) : 0
    expect((await measure(large)) - (await measure(small))).toBe(
      large.patches - small.patches + header,
    )
  })

  it.each(moonshotModels)(
    '$modelId refuses media it cannot explain instead of guessing',
    async model => {
      const meter = createMoonshotInputMeter(moonshotDefinition(model))
      const png = await bytes('image/png', 64, 48)
      const gif = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .gif()
        .toBuffer()
      const body = (url: string, role = 'user') => ({
        model: model.modelId,
        messages: [{ role, content: [{ type: 'image_url', image_url: { url } }] }],
      })
      for (const candidate of [
        body(`data:image/webp;base64,${png.toString('base64')}`),
        body(`data:image/gif;base64,${gif.toString('base64')}`),
        body('https://example.test/remote.png'),
        body(`data:image/png;base64,${png.toString('base64')}`, 'assistant'),
      ])
        expect(
          directFull(meter, { body: candidate, serialized: writeJsonLossless(candidate) }),
        ).toEqual({ kind: 'unavailable' })
      const valid = body(`data:image/png;base64,${png.toString('base64')}`)
      expect(directFull(meter, { body: valid, serialized: writeJsonLossless(valid) }).kind).toBe(
        'estimated',
      )
    },
  )
})

describe('Moonshot replayed reasoning_details history: visible text estimated, opaque refused', () => {
  const shapes = [
    {
      label: 'encrypted reasoning_details',
      details: () => [{ type: 'reasoning.encrypted', data: 'OPAQUE', format: 'unknown', index: 0 }],
      estimated: false,
    },
    {
      // The archived 2026-09-27 K3/K2.7 raw streams carry this exact entry shape beside
      // every plain `reasoning` fragment. The adopted visible-reasoning estimate (revision
      // 2) puts the merged text into the template reasoning slot: full estimated.
      label: 'archived real-route reasoning.text details',
      details: (text: string) => [{ type: 'reasoning.text', text, format: 'unknown', index: 0 }],
      estimated: true,
    },
  ] as const
  it.each(moonshotModels.flatMap(model => shapes.map(shape => ({ model, shape }))))(
    '$model.modelId $shape.label',
    async ({ model, shape }) => {
      const definition = moonshotDefinition(model)
      const host = await fixture(
        cert.tls,
        res => {
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(
            moonshotReply(model, 1, {
              servingProvider: MOONSHOT_SERVING_PROVIDER,
              details: shape.details,
            }),
          )
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
        const first = withUser(model, 'high')
        const result = await invokeModel({
          ...first,
          transport,
          credential: 'controlled-test-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in result) || result.outcome !== 'complete')
          throw new Error(JSON.stringify(result))
        const thinking = result.blocks.find(block => block.kind === 'thinking')
        if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
          throw new Error('opaque reasoning not retained')
        expect(thinking.text).toBe('Think 1.')
        const messages = [
          ...first.messages,
          judgedMessage({
            type: 'assistant',
            id: 'moonshot-opaque-assistant',
            response: 'moonshot-opaque-response',
            ending: 'complete',
            createdAt: at,
            blocks: result.blocks,
          }),
          userTurn(2),
        ]
        const original = JSON.stringify(messages)
        const planned = await plan({ ...first, messages }, model)
        const second = await invokeModel({
          ...first,
          messages,
          transport,
          credential: 'controlled-test-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        expect(JSON.stringify(messages)).toBe(original)
        if (!shape.estimated) {
          expect(second).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
          })
          expect(host.requests).toHaveLength(1)
          // The history itself is kept intact: the refused plan would replay the details.
          expect(planned).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
          })
          return
        }
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.measurement).toMatchObject({
          mode: 'full',
          precision: 'estimated',
        })
        if (!('outcome' in second) || second.outcome !== 'complete')
          throw new Error(JSON.stringify(second))
        expect(host.requests).toHaveLength(2)
        // The wire replays the merged detail unchanged; only the meter copy used `reasoning`.
        const sent = host.requests[1]?.body ?? ''
        expect(sent).toBe(planned.planned.serialized)
        expect(sent).toContain(
          '"reasoning_details":[{"type":"reasoning.text","text":"Think 1.","format":"unknown","index":0}]',
        )
        expect(sent).not.toContain('"reasoning":"Think 1."')
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )
})

// This period's model runtime carries only text and image (rulings R-I). The declared K3
// video modality is kept but not carried; no projection is invented here.
describe('Moonshot video: declared, out of this period, not carried', () => {
  const video = judgedMessage({
    id: 'moonshot-video',
    type: 'user',
    createdAt: at,
    blocks: [
      {
        id: 'moonshot-video-file',
        kind: 'file',
        attachment: {
          storage: 'attachments',
          key: 'obj_moonshot_video',
          mediaType: 'video/mp4',
          name: 'clip.mp4',
        },
        visibility: visible,
      },
    ],
  })

  it('K3 declares video but the transport does not carry it: modality_not_carried, no HTTP', async () => {
    expect(moonshotDefinition(k3).capabilities.inputModalities).toContain('video')
    const request = withUser(k3, 'high')
    const withVideo = { ...request, messages: [...request.messages, video] }
    expect(await plan(withVideo, k3)).toEqual({ rejected: 'modality_not_carried' })
    const definition = moonshotDefinition(k3)
    const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createMoonshotInputMeter(definition)],
    })
    try {
      const outcome = await invokeModel({
        ...withVideo,
        transport,
        credential: 'controlled-test-only',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      expect(outcome).toEqual({ rejected: 'modality_not_carried' })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('K2.7 Code does not declare video and is refused identically before HTTP', async () => {
    expect(moonshotDefinition(k27).capabilities.inputModalities).not.toContain('video')
    const request = withUser(k27, undefined)
    expect(await plan({ ...request, messages: [...request.messages, video] }, k27)).toEqual({
      rejected: 'modality_not_carried',
    })
  })
})
