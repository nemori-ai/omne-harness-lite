// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输，大幅噪声图用 sharp 真实编码与缩放。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { loadModelContribution as createModelPlugin } from './cordis-assembly.ts'
import { MODEL_TRANSPORT as MODEL_TRANSPORT_SERVICE } from '@omne-harness-lite/model-request-runtime/cordis'
import { createHash } from 'node:crypto'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type {PlanInput} from '@omne-harness-lite/model-request-runtime'
import {createPiAiTransport, createModelTransportService, createSharpImageCodec, modelImageBalancedV1, defineInputMeter, planRequest, createImagePreparer, inspectTransformRevision} from '@omne-harness-lite/pi-ai-transport'
import {type PlannedRequest} from '@omne-harness-lite/model-request-runtime'
import { type FullMeterInput, type LoadedImageCodec } from '@omne-harness-lite/model-request-runtime'
import { certificate, fixture, input, judgedMessage, at, content, finish } from './support.ts'
import { testDefinitions } from './definitions.ts'

const definition = (() => {
  const value = testDefinitions[0]
  if (!value) throw Error('missing fixture definition')
  return value
})()
let cert: ReturnType<typeof certificate>, noise: Buffer, small: Buffer, medium: Buffer
beforeAll(async () => {
  cert = certificate()
  const bytes = Buffer.alloc(1400 * 1400 * 3)
  let state = 1
  for (let i = 0; i < bytes.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    bytes[i] = state >>> 24
  }
  noise = await sharp(bytes, { raw: { width: 1400, height: 1400, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()
  medium = await sharp(bytes.subarray(0, 200 * 200 * 3), {
    raw: { width: 200, height: 200, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer()
  small = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } })
    .png()
    .toBuffer()
}, 30000)
afterAll(() => cert.dispose())
function imageRequest(
  bytes: Uint8Array = noise,
  mediaType = 'image/png',
  limit?: number,
): PlanInput {
  return {
    ...input(),
    ...(limit === undefined
      ? {}
      : { snapshot: { ...input().snapshot, inputConstraints: { maxImageBytes: limit } } }),
    messages: [
      judgedMessage({
        type: 'user',
        id: 'image-user',
        createdAt: at,
        blocks: [
          {
            id: 'image',
            kind: 'image',
            mediaType,
            data: { inline: Buffer.from(bytes).toString('base64') },
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
    ],
  }
}
function meter(captured: FullMeterInput[] = []) {
  return defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'openai',
    algorithmRevision: 'image-wire-fixture/1',
    evidence: 'offline source equality fixture; no upstream token accuracy claim',
    measureFull(value) {
      captured.push(value)
      return { kind: 'exact', tokens: 1 }
    },
  })
}
function countingCodec(gate?: () => Promise<void>) {
  const actual = createSharpImageCodec(sharp)
  const counts = { inspect: 0, decode: 0, encode: 0, close: 0 }
  const codec: LoadedImageCodec = {
    ...actual,
    async inspect(...args) {
      counts.inspect++
      return actual.inspect(...args)
    },
    async decode(...args) {
      counts.decode++
      const result = await actual.decode(...args)
      if (!('ok' in result)) return result
      const decoded = result.ok
      return {
        ok: {
          width: decoded.width,
          height: decoded.height,
          hasAlpha: decoded.hasAlpha,
          async encode(spec) {
            counts.encode++
            const encoded = await decoded.encode(spec)
            if (gate) await gate()
            return encoded
          },
          async close() {
            counts.close++
            await decoded.close()
          },
        },
      }
    },
  }
  return { codec, counts }
}
function planned(
  result: Awaited<ReturnType<ReturnType<typeof createPiAiTransport>['plan']>>,
): PlannedRequest {
  if (!('planned' in result)) throw Error(writeJsonLossless(result))
  return result.planned
}
function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>(r => {
    resolve = r
  })
  return { promise, resolve }
}
const retirement = {
  waitMilliseconds: 1000,
  force: true,
  schedule(ms: number, callback: () => void) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
describe('real sharp prepared request transport', () => {
  it('prepares historical and recursively nested tool images; total wire and image-count gates use every occurrence', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const wrapped = countingCodec()
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter()],
      imagePreparation: { policy: modelImageBalancedV1, codec: wrapped.codec },
    })
    const first = imageRequest(small),
      visibility = { toHuman: true, toModel: true }
    const imageBlock = {
      id: 'nested-image',
      kind: 'image',
      mediaType: 'image/png',
      data: { inline: small.toString('base64') },
      visibility,
    }
    const request = {
      ...first,
      messages: [
        ...first.messages,
        judgedMessage({
          type: 'assistant',
          id: 'call-message',
          response: 'reply',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'call',
              kind: 'tool_call',
              callId: 'image-call',
              tool: 'lookup',
              complete: true,
              arguments: {},
              visibility,
            },
          ],
        }),
        judgedMessage({
          type: 'tool',
          id: 'result-message',
          callId: 'image-call',
          createdAt: at,
          blocks: [
            {
              id: 'result',
              kind: 'tool_result',
              callId: 'image-call',
              outcome: 'completed',
              visibility,
              blocks: [imageBlock],
            },
          ],
        }),
      ],
    }
    const before = writeJsonLossless(request),
      signal = new AbortController().signal
    try {
      const result = planned(await transport.plan(request, { signal }))
      expect(result.inputLimitEvidence.images).toBe(2)
      expect(result.inputLimitEvidence.imageBytes).toEqual([small.length, small.length])
      expect(result.serialized.match(/data:image\/png;base64,/gu)).toHaveLength(2)
      expect(wrapped.counts.decode).toBe(2)
      expect(wrapped.counts.encode).toBe(0)
      expect(writeJsonLossless(request)).toBe(before)
      const exact = Buffer.byteLength(result.serialized)
      planned(
        await transport.plan(
          {
            ...request,
            snapshot: {
              ...request.snapshot,
              inputConstraints: { maxImageBytes: 4194304, maxRequestBytes: exact, maxImages: 2 },
            },
          },
          { signal },
        ),
      )
      expect(
        await transport.plan(
          {
            ...request,
            snapshot: {
              ...request.snapshot,
              inputConstraints: { maxImageBytes: 4194304, maxImages: 1 },
            },
          },
          { signal },
        ),
      ).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        metric: 'maxImages',
        actual: 2,
      })
      expect(
        await transport.plan(
          {
            ...request,
            snapshot: {
              ...request.snapshot,
              inputConstraints: { maxImageBytes: 4194304, maxRequestBytes: 1 },
            },
          },
          { signal },
        ),
      ).toEqual({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxRequestBytes'],
      })
      expect(
        await transport.plan(
          {
            ...input(),
            snapshot: {
              ...input().snapshot,
              inputConstraints: { maxImageBytes: 4194304, maxRequestBytes: 1 },
            },
          },
          { signal },
        ),
      ).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        metric: 'maxRequestBytes',
        basis: 'exact',
      })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  }, 30000)
  it('owns parameters before awaiting image work and refuses a duck preparer', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter()],
    })
    const parameters = { maxOutputTokens: 128 }
    const instance = createImagePreparer(modelImageBalancedV1, createSharpImageCodec(sharp))
    if (!('ready' in instance)) throw Error('explicit codec unavailable')
    try {
      const pending = transport.plan(
        { ...imageRequest(small), parameters },
        { signal: new AbortController().signal },
      )
      parameters.maxOutputTokens = 1
      expect(planned(await pending).parameters.maxOutputTokens).toBe(128)
      expect(
        await planRequest(
          input(),
          [definition],
          meter(),
          { signal: new AbortController().signal },
          { ...instance.ready },
        ),
      ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
      expect(host.requests).toHaveLength(0)
    } finally {
      await instance.ready.close()
      await transport.close()
      await host.close()
    }
  })
  it('fixes native transformed bytes once for projection, meter and actual HTTPS send', async () => {
    const host = await fixture(cert.tls, res => res.end(content('ok') + finish()))
    const wrapped = countingCodec(),
      captured: FullMeterInput[] = []
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter(captured)],
      imagePreparation: { policy: modelImageBalancedV1, codec: wrapped.codec },
    })
    const request = imageRequest(),
      original = writeJsonLossless(request)
    try {
      expect(noise.length).toBeGreaterThan(4194304)
      const plan = planned(await transport.plan(request, { signal: new AbortController().signal }))
      expect(writeJsonLossless(request)).toBe(original)
      expect(captured).toHaveLength(1)
      expect(captured[0]?.serialized).toBe(plan.serialized)
      expect(writeJsonLossless(captured[0]?.body)).toBe(plan.serialized)
      expect(captured[0]?.projection.requestInput.countingBasis).toEqual(
        plan.requestInput.kind === 'known' ? plan.requestInput.countingBasis : null,
      )
      const match = /data:([^;]+);base64,([A-Za-z0-9+/=]+)/u.exec(plan.serialized)
      if (!match?.[2]) throw Error('missing actual image bytes')
      const bytes = Buffer.from(match[2], 'base64')
      expect(bytes.length).toBeLessThanOrEqual(4194304)
      expect(bytes.equals(noise)).toBe(false)
      expect((await sharp(bytes).metadata()).width).toBeGreaterThan(0)
      expect(plan.requestInput.kind).toBe('known')
      if (plan.requestInput.kind !== 'known') throw Error('basis unavailable')
      expect(
        inspectTransformRevision(
          plan.requestInput.countingBasis.transformRevision,
          meter().transformRevision,
        ).kind,
      ).toBe('known')
      const encodes = wrapped.counts.encode
      const sent = await transport.send(plan, 'local-fixture-key', new AbortController().signal)
      if (!('response' in sent)) throw Error(writeJsonLossless(sent))
      for await (const _ of transport.read(sent.response, plan, new AbortController().signal)) {
        /* drain actual reader */
      }
      expect(host.requests[0]?.body).toBe(plan.serialized)
      expect(
        createHash('sha256')
          .update(host.requests[0]?.body ?? '')
          .digest('hex'),
      ).toBe(
        createHash('sha256')
          .update(captured[0]?.serialized ?? '')
          .digest('hex'),
      )
      expect(wrapped.counts.encode).toBe(encodes)
      expect(wrapped.counts.close).toBe(wrapped.counts.decode)
    } finally {
      await transport.close()
      await host.close()
    }
  }, 120000)
  it('reuses only the same opaque scope and clears the fixed service after lease release/retirement', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const wrapped = countingCodec()
    const service = createModelTransportService({
      ...host.options,
      imagePreparation: { policy: modelImageBalancedV1, codec: wrapped.codec },
    })
    const registered = service.registerAdaptation(definition, meter(), {}, () => {})
    if (!('registered' in registered)) throw Error('registration')
    const acquired = service.acquire(input().snapshot.adaptation, input().routeName)
    if (!('lease' in acquired)) throw Error('acquire')
    const scope = {},
      signal = new AbortController().signal
    try {
      const initial = planned(
        await acquired.lease.transport.plan(imageRequest(medium, 'image/png', 30000), {
          signal,
          reuseScope: scope,
        }),
      )
      const first = wrapped.counts.encode
      planned(
        await acquired.lease.transport.plan(imageRequest(medium, 'image/png', 30000), {
          signal,
          reuseScope: scope,
        }),
      )
      expect(wrapped.counts.encode).toBe(first)
      const third = planned(
        await acquired.lease.transport.plan(imageRequest(medium, 'image/png', 30000), {
          signal,
          reuseScope: scope,
        }),
      )
      expect(third.serialized).toBe(initial.serialized)
      expect(wrapped.counts.encode).toBe(first)
      const isolated = planned(
        await acquired.lease.transport.plan(imageRequest(medium, 'image/png', 30000), {
          signal,
          reuseScope: {},
        }),
      )
      expect(wrapped.counts.encode).toBeGreaterThan(first)
      service.clearReuseScope(scope)
      const before = wrapped.counts.encode
      const recomputed = planned(
        await acquired.lease.transport.plan(imageRequest(medium, 'image/png', 30000), {
          signal,
          reuseScope: scope,
        }),
      )
      expect(wrapped.counts.encode).toBeGreaterThan(before)
      expect(isolated.serialized).toBe(initial.serialized)
      expect(recomputed.serialized).toBe(initial.serialized)
      acquired.lease.release()
      service.clearReuseScope(scope)
      expect(await service.retire(registered.registered, retirement)).toEqual({ retired: true })
      service.clearReuseScope(scope)
      expect(await service.close(retirement)).toEqual({ retired: true })
      service.clearReuseScope(scope)
      expect(host.requests).toHaveLength(0)
    } finally {
      acquired.lease.release()
      await service.close(retirement)
      await host.close()
    }
  }, 30000)
  it('consumes the production registry through real Cordis with the same native bytes as the public factory', async () => {
    const host = await fixture(cert.tls, res => res.end(content('ok') + finish()))
    const wrapped = countingCodec(),
      ctx = new Context()
    const options = {
      ...host.options,
      imagePreparation: { policy: modelImageBalancedV1, codec: wrapped.codec },
    }
    const service = createModelTransportService(options)
    const transport = createPiAiTransport({
      ...options,
      definitions: [definition],
      inputMeters: [meter()],
    })
    const localProvider: Plugin.Object = {
      name: 'image-local-https-assembly',
      apply(context) {
        context.provide(MODEL_TRANSPORT_SERVICE, service)
        context.effect(() => async () => {
          await service.close(retirement)
          await service.closed
        })
      },
    }
    let release = () => {}
    try {
      await ctx.plugin(localProvider)
      await createModelPlugin(ctx, definition, meter(), retirement)
      expect(ctx.get(MODEL_TRANSPORT_SERVICE)).toBe(service)
      expect(service.inspect().registrations).toBe(1)
      const request = imageRequest(medium, 'image/png', 30000),
        signal = new AbortController().signal
      const acquired = service.acquire(request.snapshot.adaptation, request.routeName)
      if (!('lease' in acquired)) throw Error('real service acquisition failed')
      release = acquired.lease.release
      const direct = planned(await transport.plan(request, { signal }))
      const leased = planned(
        await acquired.lease.transport.plan(request, { signal, reuseScope: {} }),
      )
      expect(leased.serialized).toBe(direct.serialized)
      expect(leased.requestInput).toEqual(direct.requestInput)
      const sent = await acquired.lease.transport.send(leased, 'local-fixture-key', signal)
      if (!('response' in sent)) throw Error('local send failed')
      for await (const _ of acquired.lease.transport.read(sent.response, leased, signal)) {
        /* actual stream */
      }
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(direct.serialized)
    } finally {
      release()
      await ctx.fiber.dispose()
      await transport.close()
      await host.close()
    }
  }, 30000)
  it('fails busy before HTTP and observes aborted native completion before returning the resource', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const entered = deferred(),
      release = deferred(),
      controller = new AbortController()
    const wrapped = countingCodec(async () => {
      entered.resolve()
      await release.promise
    })
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter()],
      imagePreparation: {
        policy: { ...modelImageBalancedV1, maxConcurrent: 1 },
        codec: wrapped.codec,
      },
    })
    try {
      const pending = transport.plan(imageRequest(medium, 'image/png', 30000), {
        signal: controller.signal,
      })
      await entered.promise
      expect(
        await transport.plan(imageRequest(medium, 'image/png', 30000), {
          signal: new AbortController().signal,
        }),
      ).toEqual({ rejected: 'unavailable' })
      controller.abort()
      let returned = false
      const observed = pending.then(result => {
        returned = true
        return result
      })
      await Promise.resolve()
      expect(returned).toBe(false)
      release.resolve()
      expect(await observed).toEqual({ rejected: 'unavailable' })
      expect(wrapped.counts.close).toBe(wrapped.counts.decode)
      const before = wrapped.counts.decode
      expect(await transport.plan(imageRequest(small), { signal: AbortSignal.abort() })).toEqual({
        rejected: 'unavailable',
      })
      expect(wrapped.counts.decode).toBe(before)
      planned(await transport.plan(imageRequest(small), { signal: new AbortController().signal }))
      expect(host.requests).toHaveLength(0)
    } finally {
      release.resolve()
      await transport.close()
      await host.close()
    }
  }, 30000)
  it('aborts admission while native work drains; close waits for real decoded close', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const entered = deferred(),
      release = deferred()
    const wrapped = countingCodec(async () => {
      entered.resolve()
      await release.promise
    })
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter()],
      imagePreparation: { policy: modelImageBalancedV1, codec: wrapped.codec },
    })
    try {
      const result = transport.plan(imageRequest(medium, 'image/png', 30000), {
        signal: new AbortController().signal,
      })
      await entered.promise
      let closed = false
      const closing = transport.close().then(() => {
        closed = true
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      expect(
        await transport.plan(imageRequest(small), { signal: new AbortController().signal }),
      ).toEqual({ rejected: 'unavailable' })
      release.resolve()
      expect(await result).toEqual({ rejected: 'unavailable' })
      await closing
      expect(wrapped.counts.close).toBe(wrapped.counts.decode)
      expect(closed).toBe(true)
      expect(host.requests).toHaveLength(0)
    } finally {
      release.resolve()
      await transport.close()
      await host.close()
    }
  }, 30000)
  it('rejects MIME mismatch and truncated image, retains missing-cap preflight before decode', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const wrapped = countingCodec()
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter()],
      imagePreparation: { policy: modelImageBalancedV1, codec: wrapped.codec },
    })
    const signal = new AbortController().signal
    try {
      expect(await transport.plan(imageRequest(small, 'image/jpeg'), { signal })).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
      expect(await transport.plan(imageRequest(small.subarray(0, 20)), { signal })).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
      const before = { ...wrapped.counts },
        missing = imageRequest(medium)
      const result = await transport.plan(
        { ...missing, snapshot: { ...missing.snapshot, inputConstraints: {} } },
        { signal },
      )
      expect(result).toMatchObject({ rejected: 'invalidInput', reason: 'input_limit_missing' })
      expect(wrapped.counts).toEqual(before)
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  }, 30000)
  it('validates explicit null policy at initialization and never falls back for an image', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const options = { ...host.options, definitions: [definition], inputMeters: [meter()] }
    // Deliberate invalid public input, not an alternate preparer implementation.
    expect(() =>
      createPiAiTransport({
        ...options,
        imagePreparation: {
          // @ts-expect-error policy completeness is checked at the actual factory boundary
          policy: {},
          codec: null,
        },
      }),
    ).toThrow(TypeError)
    const transport = createPiAiTransport({
      ...options,
      imagePreparation: { policy: modelImageBalancedV1, codec: null },
    })
    try {
      planned(await transport.plan(input(), { signal: new AbortController().signal }))
      expect(
        await transport.plan(imageRequest(small), { signal: new AbortController().signal }),
      ).toEqual({ rejected: 'unavailable' })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  }, 30000)
})
