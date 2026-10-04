import sharp from 'sharp'
import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  createImagePreparer,
  createSharpImageCodec,
  imageWireBytes,
  modelImageBalancedV1,
} from '../src/image-preparation/index.ts'
import type { ImagePreparePolicy, ImagePreparer, PrepareRequestImagesInput } from '../src/image-preparation/index.ts'
import type { LoadedImageCodec } from '@omne-harness-lite/model-request-runtime'

function ready(
  policy: ImagePreparePolicy = modelImageBalancedV1,
  codec = createSharpImageCodec(sharp),
): ImagePreparer {
  const result = createImagePreparer(policy, codec)
  if ('unavailable' in result) throw new Error('Codec unavailable')
  return result.ready
}
function batch(
  bytes: Uint8Array,
  mediaType = 'image/png',
  cap = 1_000_000,
): PrepareRequestImagesInput {
  return {
    images: [{ position: 'user/0/image/0', bytes, mediaType, targetMaxBytes: cap }],
    maxRequestBytes: null,
    nonImageWireBytes: 100,
    signal: new AbortController().signal,
  }
}
async function noise(side: number): Promise<Buffer> {
  const bytes = Buffer.alloc(side * side * 3)
  let state = 42
  for (let i = 0; i < bytes.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    bytes[i] = state >>> 24
  }
  return sharp(bytes, { raw: { width: side, height: side, channels: 3 } })
    .png()
    .toBuffer()
}
function oracle(sizes: readonly number[], onEncode = () => {}): LoadedImageCodec {
  return {
    name: 'finite-oracle',
    revision: 'oracle/1',
    inputMediaTypes: ['image/png'],
    outputFormats: ['png'],
    available: () => true,
    async inspect() {
      return {
        ok: {
          mediaType: 'image/png',
          width: 64,
          height: 64,
          pages: 1,
          orientation: 1,
          hasAlpha: false,
        },
      }
    },
    async decode() {
      return {
        ok: {
          width: 64,
          height: 64,
          hasAlpha: false,
          async close() {},
          async encode(spec) {
            onEncode()
            const index = [64, 48, 32, 16].indexOf(spec.width)
            return {
              ok: {
                bytes: new Uint8Array(sizes[index] ?? 1000),
                mediaType: 'image/png',
                width: spec.width,
                height: spec.height,
              },
            }
          },
        },
      }
    },
  }
}
const finite = {
  ...modelImageBalancedV1,
  minWidth: 1,
  minHeight: 1,
  outputFormats: ['png'],
  sizeScaleSteps: [1, 0.75, 0.5, 0.25],
  maxAttemptsPerImage: 3,
} satisfies ImagePreparePolicy
async function animatedPng(): Promise<Buffer> {
  const frame = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } })
    .png()
    .toBuffer()
  function chunk(type: string, data: Buffer) {
    const bytes = Buffer.alloc(data.length + 12)
    bytes.writeUInt32BE(data.length)
    bytes.write(type, 4)
    data.copy(bytes, 8)
    bytes.writeUInt32BE(crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4)
    return bytes
  }
  const ihdr = frame.subarray(8, 33),
    imageData: Buffer[] = []
  for (let offset = 33; offset + 12 <= frame.length;) {
    const length = frame.readUInt32BE(offset)
    if (frame.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      imageData.push(frame.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const control = Buffer.alloc(8)
  control.writeUInt32BE(2)
  function frameControl(sequence: number) {
    const bytes = Buffer.alloc(26)
    bytes.writeUInt32BE(sequence)
    bytes.writeUInt32BE(8, 4)
    bytes.writeUInt32BE(8, 8)
    bytes.writeUInt16BE(100, 20)
    bytes.writeUInt16BE(1000, 22)
    return chunk('fcTL', bytes)
  }
  let sequence = 2
  return Buffer.concat([
    frame.subarray(0, 8),
    ihdr,
    chunk('acTL', control),
    frameControl(0),
    ...imageData.map(data => chunk('IDAT', data)),
    frameControl(1),
    ...imageData.map(data => {
      const prefix = Buffer.alloc(4)
      prefix.writeUInt32BE(sequence++)
      return chunk('fdAT', Buffer.concat([prefix, data]))
    }),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

describe('D109 real loaded sharp codec', () => {
  it('preserves a decoded 1x1 static GIF at ordinal zero without an encoder', async () => {
    // Same original35-byte fixture as C's OpenAI input-meter integration.
    const bytes = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAkQBADs=', 'base64')
    const metadata = await sharp(bytes, { animated: true }).metadata()
    expect([metadata.width, metadata.height, metadata.pages]).toEqual([1, 1, 1])
    const preparer = ready()
    const result = await preparer.prepareRequestImages(batch(bytes, 'image/gif'))
    if (!('prepared' in result)) throw new Error(JSON.stringify(result))
    const image = result.prepared.images[0]
    if (!image) throw new Error('missing')
    expect(image.mediaType).toBe('image/gif')
    expect(Buffer.from(image.bytes).equals(bytes)).toBe(true)
    expect([image.width, image.height, image.changed, image.candidateOrdinal]).toEqual([
      1,
      1,
      false,
      0,
    ])
    expect(result.prepared.exploredThrough).toEqual([0])
    await preparer.close()
  })
  it('closes each owned decoded native handle once on successful preparation', async () => {
    let decodes = 0,
      closes = 0
    const codec = createSharpImageCodec(sharp)
    const counting: LoadedImageCodec = {
      ...codec,
      async decode(...args) {
        const result = await codec.decode(...args)
        if ('failure' in result) return result
        decodes++
        const decoded = result.ok
        return {
          ok: {
            ...decoded,
            async close() {
              closes++
              await decoded.close()
            },
          },
        }
      },
    }
    const preparer = ready(modelImageBalancedV1, counting)
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } })
      .png()
      .toBuffer()
    expect('prepared' in (await preparer.prepareRequestImages(batch(bytes)))).toBe(true)
    expect(decodes).toBe(1)
    expect(closes).toBe(1)
    await preparer.close()
    expect(closes).toBe(1)
  })
  it('real native scoped cache encodes only the first of three rounds and eviction recomputes same bytes', async () => {
    let encodes = 0
    const codec = createSharpImageCodec(sharp)
    const instrumented: LoadedImageCodec = {
      ...codec,
      async decode(...args) {
        const result = await codec.decode(...args)
        if ('failure' in result) return result
        const decoded = result.ok
        return {
          ok: {
            ...decoded,
            async encode(spec) {
              encodes++
              return decoded.encode(spec)
            },
          },
        }
      },
    }
    const preparer = ready(
        { ...modelImageBalancedV1, maxWidth: 128, maxHeight: 128 },
        instrumented,
      ),
      scope = {},
      bytes = await noise(256)
    const input = batch(bytes, 'image/png', 100_000)
    const digests: string[] = []
    for (let i = 0; i < 3; i++) {
      const result = await preparer.prepareRequestImages(input, scope)
      if (!('prepared' in result)) throw new Error(JSON.stringify(result))
      digests.push(result.prepared.images[0]?.targetDigest ?? '')
    }
    expect(encodes).toBe(1)
    expect(new Set(digests).size).toBe(1)
    preparer.clearScope(scope)
    const recomputed = await preparer.prepareRequestImages(input, scope)
    if (!('prepared' in recomputed)) throw new Error(JSON.stringify(recomputed))
    expect(recomputed.prepared.images[0]?.targetDigest).toBe(digests[0])
    expect(encodes).toBe(2)
    await preparer.close()
  })
  it('decodes compliant small images then preserves original owned bytes', async () => {
    const bytes = await sharp({
      create: { width: 8, height: 5, channels: 4, background: { r: 10, g: 30, b: 80, alpha: 0.4 } },
    })
      .png()
      .toBuffer()
    const preparer = ready()
    const result = await preparer.prepareRequestImages(batch(bytes))
    expect('prepared' in result).toBe(true)
    if ('prepared' in result) {
      expect(result.prepared.images[0]?.bytes).toEqual(new Uint8Array(bytes))
      expect(result.prepared.images[0]?.changed).toBe(false)
      expect(result.prepared.exploredThrough).toEqual([0])
    }
    await preparer.close()
  })
  it('converts a real >4MiB source below its cap without changing source', async () => {
    const bytes = await noise(1400),
      original = Buffer.from(bytes)
    expect(bytes.length).toBeGreaterThan(4 * 1024 * 1024)
    const preparer = ready()
    const result = await preparer.prepareRequestImages(batch(bytes, 'image/png', 2 * 1024 * 1024))
    expect('prepared' in result).toBe(true)
    if ('prepared' in result) {
      const image = result.prepared.images[0]
      if (!image) throw new Error('missing')
      expect(image.mediaType).toBe('image/jpeg')
      expect(image.bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024)
      expect((await sharp(image.bytes).metadata()).width).toBe(1400)
    }
    expect(bytes.equals(original)).toBe(true)
    await preparer.close()
  })
  it('applies EXIF and preserves alpha without flattening', async () => {
    const exif = await sharp({ create: { width: 80, height: 40, channels: 3, background: 'red' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const preparer = ready()
    const rotated = await preparer.prepareRequestImages(batch(exif, 'image/jpeg'))
    if (!('prepared' in rotated)) throw new Error(JSON.stringify(rotated))
    const image = rotated.prepared.images[0]
    if (!image) throw new Error('missing')
    expect([image.width, image.height]).toEqual([40, 80])
    expect((await sharp(image.bytes).metadata()).orientation).toBeUndefined()
    const alpha = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 20, g: 40, b: 80, alpha: 0.3 },
      },
    })
      .png()
      .toBuffer()
    const alphaPreparer = ready({ ...modelImageBalancedV1, maxWidth: 64, maxHeight: 64 })
    const transformed = await alphaPreparer.prepareRequestImages(batch(alpha))
    if (!('prepared' in transformed)) throw new Error(JSON.stringify(transformed))
    const out = transformed.prepared.images[0]
    if (!out) throw new Error('missing')
    expect(out.width).toBe(64)
    expect((await sharp(out.bytes).metadata()).hasAlpha).toBe(true)
    expect(out.mediaType).not.toBe('image/jpeg')
    await alphaPreparer.close()
    const webp = ready({
      ...modelImageBalancedV1,
      maxWidth: 64,
      maxHeight: 64,
      outputFormats: ['webp'],
    })
    const webpResult = await webp.prepareRequestImages(batch(alpha))
    if (!('prepared' in webpResult)) throw new Error(JSON.stringify(webpResult))
    const webpImage = webpResult.prepared.images[0]
    if (!webpImage) throw new Error('missing')
    expect((await sharp(webpImage.bytes).metadata()).format).toBe('webp')
    expect((await sharp(webpImage.bytes).metadata()).hasAlpha).toBe(true)
    await webp.close()
    for (const attempts of [1, 2]) {
      const alphaOrdinal = ready({
        ...modelImageBalancedV1,
        maxWidth: 64,
        maxHeight: 64,
        outputFormats: ['jpeg', 'png'],
        qualitySteps: [85],
        maxAttemptsPerImage: attempts,
      })
      const result = await alphaOrdinal.prepareRequestImages(batch(alpha))
      if (attempts === 1)
        expect(result).toEqual({
          rejected: { reason: 'no_candidate', stage: 'per_image', imageIndex: 0 },
        })
      else if ('prepared' in result) expect(result.prepared.images[0]?.candidateOrdinal).toBe(2)
      else throw new Error('missing ordinal2')
      await alphaOrdinal.close()
    }
    await preparer.close()
  })
  it('rejects MIME lies, malformed, truncated, animation and source pixel limits', async () => {
    const preparer = ready()
    const bytes = await noise(64)
    expect(await preparer.prepareRequestImages(batch(bytes, 'image/jpeg'))).toEqual({
      rejected: { reason: 'malformed_image', imageIndex: 0 },
    })
    expect(
      'rejected' in (await preparer.prepareRequestImages(batch(new Uint8Array([1, 2, 3])))),
    ).toBe(true)
    expect(
      'rejected' in
        (await preparer.prepareRequestImages(batch(bytes.subarray(0, bytes.length - 80)))),
    ).toBe(true)
    const frames = Buffer.alloc(64 * 128 * 4, 120)
    frames.fill(220, 64 * 64 * 4)
    const animation = await sharp(frames, {
      raw: { width: 64, height: 128, channels: 4, pageHeight: 64 },
    })
      .gif({ loop: 0, delay: [100, 100] })
      .toBuffer()
    expect(await preparer.prepareRequestImages(batch(animation, 'image/gif'))).toEqual({
      rejected: { reason: 'animated_input', imageIndex: 0 },
    })
    expect(await preparer.prepareRequestImages(batch(await animatedPng()))).toEqual({
      rejected: { reason: 'animated_input', imageIndex: 0 },
    })
    const gif = await sharp({ create: { width: 64, height: 64, channels: 3, background: 'blue' } })
      .gif()
      .toBuffer()
    expect('prepared' in (await preparer.prepareRequestImages(batch(gif, 'image/gif')))).toBe(true)
    const limited = ready({ ...modelImageBalancedV1, decodedMaxPixels: 100 })
    expect(await limited.prepareRequestImages(batch(bytes))).toEqual({
      rejected: { reason: 'source_resource_limit', imageIndex: 0 },
    })
    await limited.close()
    await preparer.close()
  })
})

describe('D109 finite search, cache and resource ownership', () => {
  it('cold/warm cache observes same logical ordinal prefix, including review counterexample', async () => {
    for (const attempts of [2, 3]) {
      let encodes = 0
      const preparer = ready(
          { ...finite, maxAttemptsPerImage: attempts },
          oracle([200, 100, 50], () => encodes++),
        ),
        scope = {}
      const input = batch(new Uint8Array(300), 'image/png', 120)
      const warm = await preparer.prepareRequestImages(input, scope)
      expect('prepared' in warm).toBe(true)
      const tight = { ...input, maxRequestBytes: 200 }
      const hot = await preparer.prepareRequestImages(tight, scope)
      const repeated = await preparer.prepareRequestImages(tight, scope)
      preparer.clearScope(scope)
      const cold = await preparer.prepareRequestImages(tight, scope)
      expect(hot).toEqual(cold)
      expect(repeated).toEqual(hot)
      if (attempts === 2)
        expect(hot).toEqual({ rejected: { reason: 'no_candidate', stage: 'request_total' } })
      else if ('prepared' in hot) expect(hot.prepared.images[0]?.candidateOrdinal).toBe(3)
      else throw new Error('expected ordinal3')
      expect(encodes).toBeGreaterThan(0)
      await preparer.close()
    }
  })
  it('three stable rounds encode only once and scope clear recomputes identical bytes', async () => {
    let calls = 0
    const preparer = ready(
        finite,
        oracle([100], () => calls++),
      ),
      scope = {},
      input = batch(new Uint8Array(300), 'image/png', 120)
    const results = []
    for (let i = 0; i < 3; i++) results.push(await preparer.prepareRequestImages(input, scope))
    expect(calls).toBe(1)
    expect(results[0]).toEqual(results[2])
    preparer.clearScope(scope)
    expect(await preparer.prepareRequestImages(input, scope)).toEqual(results[0])
    expect(calls).toBe(2)
    await preparer.close()
  })
  it('clearScope during native ownership cannot republish stale tables or evict the new table', async () => {
    let encodes = 0
    const entered = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<void>(),
      codec = oracle([100])
    const instrumented: LoadedImageCodec = {
      ...codec,
      async decode(...args) {
        const result = await codec.decode(...args)
        if ('failure' in result) return result
        const decoded = result.ok
        return {
          ok: {
            ...decoded,
            async encode(spec) {
              const first = ++encodes === 1
              const result = await decoded.encode(spec)
              if (first) {
                entered.resolve()
                await gate.promise
              }
              return result
            },
          },
        }
      },
    }
    const preparer = ready({ ...finite, maxCacheEntries: 1 }, instrumented),
      scope = {},
      input = batch(new Uint8Array(300), 'image/png', 120)
    const old = preparer.prepareRequestImages(input, scope)
    await entered.promise
    preparer.clearScope(scope)
    const current = await preparer.prepareRequestImages(input, scope)
    gate.resolve()
    expect(await old).toEqual(current)
    expect(await preparer.prepareRequestImages(input, scope)).toEqual(current)
    expect(encodes).toBe(2)
    await preparer.close()
  })
  it('rejects oversized native candidates without caching, and isolates scopes and target caps', async () => {
    let calls = 0
    const codec = oracle([100], () => calls++)
    const oversized = ready({ ...finite, candidateMaxBytes: 50 }, codec),
      scope = {},
      input = batch(new Uint8Array(300), 'image/png', 120)
    expect('rejected' in (await oversized.prepareRequestImages(input, scope))).toBe(true)
    const firstCalls = calls
    expect('rejected' in (await oversized.prepareRequestImages(input, scope))).toBe(true)
    expect(calls).toBe(firstCalls * 2)
    await oversized.close()
    calls = 0
    const preparer = ready({ ...finite, maxCacheEntries: 1 }, codec)
    const one = await preparer.prepareRequestImages(input, scope)
    if (!('prepared' in one)) throw new Error('missing prepared')
    one.prepared.images[0]?.bytes.fill(255)
    const two = await preparer.prepareRequestImages(input, scope)
    if (!('prepared' in two)) throw new Error('missing prepared')
    expect(two.prepared.images[0]?.bytes[0]).toBe(0)
    expect(calls).toBe(1)
    await preparer.prepareRequestImages(input, {})
    expect(calls).toBe(2)
    await preparer.prepareRequestImages(input, scope)
    expect(calls).toBe(3)
    await preparer.prepareRequestImages(batch(new Uint8Array(300), 'image/png', 130), scope)
    expect(calls).toBe(4)
    await preparer.close()
  })
  it('rejects getters without reading them, shared buffers, missing fields and busy RGBA budgets', async () => {
    const preparer = ready({ ...finite, maxInFlightBytes: 1000 }, oracle([100]))
    let accessed = false
    const input = batch(new Uint8Array(300), 'image/png', 120)
    Object.defineProperty(input, 'nonImageWireBytes', {
      get() {
        accessed = true
        return 1
      },
    })
    expect(await preparer.prepareRequestImages(input)).toEqual({
      rejected: { reason: 'malformed_input', field: 'input' },
    })
    expect(accessed).toBe(false)
    const spoofedBytes = new Uint8Array(300)
    Object.defineProperty(spoofedBytes, 'byteLength', {
      get() {
        accessed = true
        return 0
      },
    })
    expect('rejected' in (await preparer.prepareRequestImages(batch(spoofedBytes)))).toBe(true)
    expect(accessed).toBe(false)
    expect(
      'rejected' in
        (await preparer.prepareRequestImages(batch(new Uint8Array(new SharedArrayBuffer(1))))),
    ).toBe(true)
    expect(await preparer.prepareRequestImages(batch(new Uint8Array(300)))).toEqual({
      rejected: { reason: 'provider_unavailable', cause: 'busy' },
    })
    expect(
      await preparer.prepareRequestImages({ ...batch(new Uint8Array(1)), images: [] }),
    ).toEqual({ prepared: { images: [], exploredThrough: [] } })
    await preparer.close()
  })
  it('does not split total budget evenly and handles nonmonotonic contributions', async () => {
    const codec = oracle([400, 500, 100, 50])
    const preparer = ready({ ...finite, maxAttemptsPerImage: 4 }, codec)
    const input = {
      ...batch(new Uint8Array(600), 'image/png', 450),
      images: [
        { position: 'a', bytes: new Uint8Array(600), mediaType: 'image/png', targetMaxBytes: 450 },
        { position: 'b', bytes: new Uint8Array(20), mediaType: 'image/png', targetMaxBytes: 450 },
      ],
      maxRequestBytes: 750,
    }
    const result = await preparer.prepareRequestImages(input)
    if (!('prepared' in result)) throw new Error(JSON.stringify(result))
    expect(result.prepared.images.map(image => image.candidateOrdinal)).toEqual([1, 0])
    expect(
      100 + result.prepared.images.reduce((sum, image) => sum + imageWireBytes(image), 0),
    ).toBeLessThanOrEqual(750)
    const tighter = await preparer.prepareRequestImages({ ...input, maxRequestBytes: 400 })
    if (!('prepared' in tighter)) throw new Error(JSON.stringify(tighter))
    expect(tighter.prepared.images[0]?.candidateOrdinal).toBe(3)
    await preparer.close()
  })
  it('has explicit unavailable/busy/config/exact empty boundaries and owns returned copies', async () => {
    const codec = oracle([100])
    expect(createImagePreparer(finite, { ...codec, available: () => false })).toEqual({
      unavailable: true,
    })
    expect(() => createImagePreparer({ ...finite, qualitySteps: [70, 85] }, codec)).toThrow(
      TypeError,
    )
    const preparer = ready({ ...finite, maxInFlightBytes: 100 }, codec)
    expect(await preparer.prepareRequestImages(batch(new Uint8Array(101)))).toEqual({
      rejected: { reason: 'provider_unavailable', cause: 'busy' },
    })
    expect(
      await preparer.prepareRequestImages({
        ...batch(new Uint8Array(0)),
        images: [],
        maxRequestBytes: 99,
      }),
    ).toEqual({
      rejected: { reason: 'exact_request_limit_exceeded', actualBytes: 100, limitBytes: 99 },
    })
    const aborted = new AbortController()
    aborted.abort()
    expect(
      await preparer.prepareRequestImages({ ...batch(new Uint8Array(1)), signal: aborted.signal }),
    ).toEqual({ rejected: { reason: 'aborted' } })
    const closing = preparer.close()
    expect(preparer.close()).toBe(closing)
    await closing
    expect(await preparer.prepareRequestImages(batch(new Uint8Array(1)))).toEqual({
      rejected: { reason: 'provider_unavailable', cause: 'closed' },
    })
  })
  it('actual native encode settles before cancelled prepare/close completes; codec remains borrowed', async () => {
    const bytes = await noise(1400),
      codec = createSharpImageCodec(sharp)
    let entered = () => {},
      release = () => {}
    const started = new Promise<void>(resolve => {
        entered = resolve
      }),
      gate = new Promise<void>(resolve => {
        release = resolve
      })
    let nativeDone = false
    const instrumented: LoadedImageCodec = {
      ...codec,
      async decode(...args) {
        const result = await codec.decode(...args)
        if ('failure' in result) return result
        const decoded = result.ok
        return {
          ok: {
            ...decoded,
            async encode(spec) {
              entered()
              const task = decoded.encode(spec)
              await gate
              const out = await task
              nativeDone = true
              return out
            },
          },
        }
      },
    }
    const preparer = ready(modelImageBalancedV1, instrumented),
      controller = new AbortController()
    const pending = preparer.prepareRequestImages({
      ...batch(bytes, 'image/png', 2_000_000),
      signal: controller.signal,
    })
    await started
    controller.abort()
    const close = preparer.close()
    let stopped = false
    close.then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    release()
    expect(await pending).toEqual({ rejected: { reason: 'aborted' } })
    await close
    expect(nativeDone).toBe(true)
    expect(codec.available()).toBe(true)
  })
  it('drains actual inspect/decode/encode/decoded-release stages before cancellation returns', async () => {
    const bytes = await noise(128)
    for (const stage of ['inspect', 'decode', 'encode', 'release']) {
      const codec = createSharpImageCodec(sharp),
        entered = Promise.withResolvers<void>(),
        gate = Promise.withResolvers<void>()
      let decodedClosed = false
      let closeCalls = 0
      const wrapped: LoadedImageCodec = {
        ...codec,
        async inspect(...args) {
          const result = await codec.inspect(...args)
          if (stage === 'inspect') {
            entered.resolve()
            await gate.promise
          }
          return result
        },
        async decode(...args) {
          const result = await codec.decode(...args)
          if ('failure' in result) return result
          if (stage === 'decode') {
            entered.resolve()
            await gate.promise
          }
          const decoded = result.ok
          return {
            ok: {
              ...decoded,
              async encode(spec) {
                const result = await decoded.encode(spec)
                if (stage === 'encode') {
                  entered.resolve()
                  await gate.promise
                }
                return result
              },
              async close() {
                closeCalls++
                await decoded.close()
                if (stage === 'release') {
                  entered.resolve()
                  await gate.promise
                }
                decodedClosed = true
              },
            },
          }
        },
      }
      const preparer = ready(modelImageBalancedV1, wrapped),
        controller = new AbortController()
      const pending = preparer.prepareRequestImages({
        ...batch(bytes, 'image/png', 20_000),
        signal: controller.signal,
      })
      // The source is >20k and forces encode before the release-stage gate.
      await entered.promise
      controller.abort()
      let returned = false
      const observed = pending.then(result => {
        returned = true
        return result
      })
      const closing = preparer.close()
      await Promise.resolve()
      expect(returned).toBe(false)
      gate.resolve()
      expect(await observed).toEqual({ rejected: { reason: 'aborted' } })
      await closing
      if (stage !== 'inspect') expect(decodedClosed).toBe(true)
      expect(closeCalls).toBe(stage === 'inspect' ? 0 : 1)
    }
  })
})
