// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输，大图用 sharp 真实编码，输入计量用真实分词器。
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { type PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  createModelTransportService,
  createSharpImageCodec,
  modelImageBalancedV1,
  createDeepSeekV41FlashInputMeter,
  deepseekV41FlashDefinition,
  createOfficialProfileContent,
} from '@omne-harness-lite/pi-ai-transport'
import {
  type LoadedImageCodec,
  type FullMeterInput,
} from '@omne-harness-lite/model-request-runtime'
import { loadModelContribution as createModelPlugin } from './cordis-assembly.ts'
import { MODEL_TRANSPORT as MODEL_TRANSPORT_SERVICE } from '@omne-harness-lite/model-request-runtime/cordis'
import {
  at,
  certificate,
  content,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  policy,
} from './support.ts'

const definition = deepseekV41FlashDefinition
let cert: ReturnType<typeof certificate>, large: Buffer
beforeAll(async () => {
  cert = certificate()
  const raw = Buffer.alloc(1400 * 1400 * 3)
  let seed = 1
  for (let index = 0; index < raw.length; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    raw[index] = seed >>> 24
  }
  large = await sharp(raw, { raw: { width: 1400, height: 1400, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()
}, 30000)
afterAll(() => cert.dispose())

function request(): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['deepinfra/fp8'],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: definition.modelId,
    provider: 'deepinfra/fp8',
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    snapshot: {
      ...base.snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      updatedAt: at,
    },
    messages: [
      judgedMessage({
        type: 'user',
        id: 'large-image',
        createdAt: at,
        blocks: [
          {
            id: 'image',
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: large.toString('base64') },
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
    ],
  }
}
const retirement = {
  waitMilliseconds: 1000,
  force: true,
  schedule(ms: number, callback: () => void) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

describe('DeepSeek Flash D109 production codec and service', () => {
  it('uses identical prepared image bytes for meter and wire, reuses three-turn scope, then releases it', async () => {
    expect(large.length).toBeGreaterThan(4194304)
    const native = createSharpImageCodec(sharp)
    const counts = { decode: 0, encode: 0, close: 0 }
    const codec: LoadedImageCodec = {
      ...native,
      async decode(...args) {
        counts.decode++
        const decoded = await native.decode(...args)
        if (!('ok' in decoded)) return decoded
        const image = decoded.ok
        return {
          ok: {
            ...image,
            async encode(spec) {
              counts.encode++
              return image.encode(spec)
            },
            async close() {
              counts.close++
              await image.close()
            },
          },
        }
      },
    }
    const host = await fixture(cert.tls, res => res.end(content('ok') + finish()))
    const service = createModelTransportService({
      ...host.options,
      imagePreparation: { policy: modelImageBalancedV1, codec },
    })
    const originalMeter = createDeepSeekV41FlashInputMeter(definition)
    const measurements: FullMeterInput[] = []
    const meter = {
      ...originalMeter,
      measureFull(value: FullMeterInput) {
        measurements.push(value)
        return originalMeter.measureFull(value)
      },
    }
    const ctx = new Context()
    const provider: Plugin.Object = {
      name: 'deepseek-image-local-service',
      apply(context) {
        context.provide(MODEL_TRANSPORT_SERVICE, service)
        context.effect(() => async () => {
          await service.close(retirement)
          await service.closed
        })
      },
    }
    let release = () => {}
    const scope = {},
      initial = request(),
      source = writeJsonLossless(initial)
    try {
      await ctx.plugin(provider)
      await createModelPlugin(ctx, definition, meter, retirement)
      const acquired = service.acquire(initial.snapshot.adaptation, initial.routeName)
      if (!('lease' in acquired)) throw Error('actual registered Flash unavailable')
      release = acquired.lease.release
      let current = initial
      let firstDecodes = 0,
        firstEncodes = 0,
        preparedImage = ''
      for (let turn = 0; turn < 3; turn++) {
        const result = await invokeModel({
          ...current,
          transport: acquired.lease.transport,
          credential: 'local-fixture-only',
          signal: new AbortController().signal,
          reuseScope: scope,
          policy: policy(),
        }).outcome
        expect(result).toMatchObject({ outcome: 'complete' })
        const measured = measurements[turn]
        if (!measured) throw Error('missing final Flash measurement')
        expect(host.requests[turn]?.body).toBe(measured.serialized)
        expect(writeJsonLossless(measured.body)).toBe(measured.serialized)
        const image = /data:([^;]+);base64,([A-Za-z0-9+/=]+)/u.exec(measured.serialized)
        if (!image?.[2]) throw Error('prepared image missing')
        const bytes = Buffer.from(image[2], 'base64')
        expect(bytes.length).toBeLessThanOrEqual(4194304)
        expect(bytes.equals(large)).toBe(false)
        expect((await sharp(bytes).metadata()).width).toBeGreaterThan(0)
        if (turn === 0) {
          firstDecodes = counts.decode
          firstEncodes = counts.encode
          preparedImage = image[0]
        }
        expect(image[0]).toBe(preparedImage)
        // D109 reuses encoded candidates; each request still validates/decodes
        // its original image under the current resource and format bounds.
        expect(counts.decode).toBe(firstDecodes + turn)
        expect(counts.encode).toBe(firstEncodes)
        expect(counts.close).toBe(counts.decode)
        current = {
          ...current,
          messages: [
            ...current.messages,
            judgedMessage({
              type: 'assistant',
              id: `answer-${turn}`,
              response: `response-${turn}`,
              createdAt: at,
              ending: 'complete',
              blocks: [
                {
                  id: `answer-text-${turn}`,
                  kind: 'text',
                  text: 'ok',
                  visibility: { toHuman: true, toModel: true },
                },
              ],
            }),
            message('user', `turn ${turn + 2}`, `next-${turn}`),
          ],
        }
      }
      expect(writeJsonLossless(initial)).toBe(source)
      service.clearReuseScope(scope)
      const again = await acquired.lease.transport.plan(initial, {
        signal: new AbortController().signal,
        reuseScope: scope,
      })
      expect(again).toHaveProperty('planned')
      expect(counts.decode).toBeGreaterThan(firstDecodes)
      expect(counts.encode).toBeGreaterThan(firstEncodes)
      expect(counts.close).toBe(counts.decode)
      const refused = await acquired.lease.transport.plan(
        { ...initial, snapshot: { ...initial.snapshot, inputConstraints: { maxImageBytes: 1 } } },
        { signal: new AbortController().signal, reuseScope: scope },
      )
      expect(refused).toEqual({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxImageBytes'],
      })
      expect(host.requests).toHaveLength(3)
      release()
      service.clearReuseScope(scope)
    } finally {
      release()
      await ctx.fiber.dispose()
      await host.close()
    }
    expect(service.inspect().registrations).toBe(0)
    expect(counts.close).toBe(counts.decode)
  }, 120000)
})
