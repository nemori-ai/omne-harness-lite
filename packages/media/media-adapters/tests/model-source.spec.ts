import { describe, expect, it } from 'vitest'
import { createModelMediaSource } from '@omne-harness/media-adapters'
import type { ContentReference, Variants } from '@omne-harness/media-contract'
import type { ModelMediaLimits } from '@omne-harness/model-contract/provider'
import { png, shrinking, T1, T2, world } from './world.ts'

const signal = new AbortController().signal
const PNG_ONLY = ['image/png']
const limitsOf = (over: Partial<ModelMediaLimits> = {}): ModelMediaLimits => ({
  mediaTypes: PNG_ONLY,
  maxBytes: 64,
  image: null,
  ...over,
})
const SMALL = png(4, 3, 1)
/** An original of 31 bytes: the stand-in image and a filler after it. */
const LARGE = new Uint8Array([...png(40, 30, 7), ...new Uint8Array(20).fill(9)])

function sourceOver(variants: Variants | undefined) {
  return createModelMediaSource<string>(() => (variants === undefined ? undefined : { variants }))
}
const open = (
  source: ReturnType<typeof sourceOver>,
  reference: ContentReference,
  limits = limitsOf(),
  tenant = T1,
) => source.open({ principal: 'someone', tenant, reference, limits }, signal)

describe('the media source of Model over media', () => {
  it('gives the bytes of an original within the limits, with its facts as a measurement', async () => {
    const w = world(shrinking)
    const reference = await w.staged(T1, 'up-a', SMALL)
    expect(await open(sourceOver(w.media.variants), reference)).toEqual({
      ok: {
        mediaType: 'image/png',
        bytes: SMALL,
        measurement: {
          reference,
          bytes: '11',
          mediaType: 'image/png',
          kind: 'image',
          widthPixels: '4',
          heightPixels: '3',
        },
      },
    })
  })

  it.each([
    ['its bytes', limitsOf({ maxBytes: 16 }), [40, 30]],
    ['its width and height', limitsOf({ image: { maxWidth: 8, maxHeight: 6 } }), [8, 6]],
  ] as const)(
    'gives a version within the limits when the original is over %s, and measures the version',
    async (_, limits, [width, height]) => {
      const w = world(shrinking)
      const reference = await w.staged(T1, 'up-large', LARGE)
      const read = await open(sourceOver(w.media.variants), reference, limits)
      if (!('ok' in read)) throw new Error(JSON.stringify(read.failure))
      expect(read.ok.bytes).toEqual(png(width, height))
      expect(read.ok.bytes.byteLength).toBeLessThanOrEqual(limits.maxBytes)
      expect(read.ok.measurement).toEqual({
        reference,
        bytes: '11',
        mediaType: 'image/png',
        kind: 'image',
        widthPixels: String(width),
        heightPixels: String(height),
      })
    },
  )

  it('answers too large when no version within the limits can be made', async () => {
    const w = world(shrinking)
    const reference = await w.staged(T1, 'up-large', LARGE)
    const source = sourceOver(w.media.variants)
    expect(await open(source, reference, limitsOf({ maxBytes: 10 }))).toEqual({
      failure: { kind: 'too-large' },
    })
    expect(await open(source, reference, limitsOf({ mediaTypes: ['image/jpeg'] }))).toEqual({
      failure: { kind: 'too-large' },
    })
  })

  it('answers material unavailable for a reference that names no medium of this tenant', async () => {
    const w = world(shrinking)
    const reference = await w.staged(T1, 'up-a', SMALL)
    const source = sourceOver(w.media.variants)
    const unavailable = { failure: { kind: 'material-unavailable' } }
    expect(await open(source, reference, limitsOf(), T2)).toEqual(unavailable)
    expect(await open(source, { ...reference, key: 'f'.repeat(32) })).toEqual(unavailable)
  })

  it('names what the port is asked: the tenant of the access, the reference and the target of the limits', async () => {
    const asked: unknown[] = []
    const variants: Variants = {
      open: async input => {
        asked.push(input)
        return { failure: { kind: 'material-unavailable' } }
      },
    }
    const reference = { storage: 's', key: 'k', mediaType: 'image/png', bytes: '9', digest: 'd' }
    const source = sourceOver(variants)
    expect(await open(source, reference)).toEqual({ failure: { kind: 'material-unavailable' } })
    await open(source, reference, limitsOf({ maxBytes: 5, image: { maxWidth: 3, maxHeight: 2 } }))
    const unbounded = Number.MAX_SAFE_INTEGER
    expect(asked).toEqual([
      {
        tenant: T1,
        ref: reference,
        target: { mediaTypes: PNG_ONLY, maxBytes: 64, maxWidth: unbounded, maxHeight: unbounded },
      },
      {
        tenant: T1,
        ref: reference,
        target: { mediaTypes: PNG_ONLY, maxBytes: 5, maxWidth: 3, maxHeight: 2 },
      },
    ])
  })

  it.each([
    [
      { kind: 'voice', durationMs: 1500, sampleRate: 16000, channels: 1 },
      { kind: 'voice', durationMs: '1500', sampleRate: '16000', channels: '1' },
    ],
    [{ kind: 'file' }, { kind: 'file' }],
  ] as const)('measures a medium of kind $0.kind as its facts say', async (facts, measured) => {
    const reference = { storage: 's', key: 'k', mediaType: 'audio/wav', bytes: '9', digest: 'd' }
    const bytes = new Uint8Array([1, 2, 3])
    const variants: Variants = {
      open: async () => ({ ok: { mediaType: 'audio/wav', bytes, facts } }),
    }
    expect(await open(sourceOver(variants), reference)).toEqual({
      ok: {
        mediaType: 'audio/wav',
        bytes,
        measurement: { reference, bytes: '3', mediaType: 'audio/wav', ...measured },
      },
    })
  })

  it('answers unavailable while media is not there or one of its dependencies is not', async () => {
    const reference = { storage: 's', key: 'k', mediaType: 'image/png', bytes: '9', digest: 'd' }
    expect(await open(sourceOver(undefined), reference)).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'media is not there' },
    })
    const down: Variants = {
      open: async () => ({ failure: { kind: 'unavailable', dependency: 'store' } }),
    }
    expect(await open(sourceOver(down), reference)).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'media: store is unavailable' },
    })
  })
})
