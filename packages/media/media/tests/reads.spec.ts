import { describe, expect, it } from 'vitest'
import { T1, failureOf, ok, pdf, png, world } from './world.ts'

const IMAGE = png(40, 30, 7)
const TARGET = {
  mediaTypes: ['image/png', 'image/webp'],
  maxBytes: 64,
  maxWidth: 20,
  maxHeight: 20,
}

describe('a request version', () => {
  it('is the original when the original is within the target', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', png(4, 3))
    const opened = ok(await w.media.variants.open({ tenant: T1, ref, target: TARGET }))
    expect(opened).toMatchObject({
      mediaType: 'image/png',
      facts: { widthPixels: 4, heightPixels: 3 },
    })
    expect(w.image.fits).toEqual([])
  })

  it('is made once for an image over the target, and comes from the cache after that', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const first = ok(await w.media.variants.open({ tenant: T1, ref, target: TARGET }))
    expect(first).toMatchObject({
      mediaType: 'image/webp',
      facts: { kind: 'image', widthPixels: 20, heightPixels: 20 },
    })
    expect(ok(await w.media.variants.open({ tenant: T1, ref, target: TARGET }))).toEqual(first)
    expect(w.image.fits).toEqual(['20x20'])
    expect(ok(await w.media.variants.open({ tenant: T1, ref, target: null })).bytes).toEqual(IMAGE)
  })

  it('is made for an image of a type the target does not take', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', png(4, 3))
    const webpOnly = { ...TARGET, mediaTypes: ['image/webp'] }
    expect(ok(await w.media.variants.open({ tenant: T1, ref, target: webpOnly })).mediaType).toBe(
      'image/webp',
    )
  })

  it('answers too large when no version fits, and for a medium that is not an image', async () => {
    const w = world()
    const image = await w.staged(T1, 'up', IMAGE)
    expect(
      await w.media.variants.open({
        tenant: T1,
        ref: image.ref,
        target: { ...TARGET, maxBytes: 5 },
      }),
    ).toEqual({ failure: { kind: 'too-large' } })
    const file = await w.staged(T1, 'doc', pdf('a long enough page'), 'application/pdf')
    expect(
      await w.media.variants.open({
        tenant: T1,
        ref: file.ref,
        target: { ...TARGET, mediaTypes: ['application/pdf'], maxBytes: 8 },
      }),
    ).toEqual({ failure: { kind: 'too-large' } })
    expect(
      ok(
        await w.media.variants.open({
          tenant: T1,
          ref: file.ref,
          target: { ...TARGET, mediaTypes: ['application/pdf'] },
        }),
      ).mediaType,
    ).toBe('application/pdf')
  })

  it('drops the least recently used version when the cache is full, and makes it again', async () => {
    const w = world({ variantCacheBytes: 20 })
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const open = (maxWidth: number) =>
      w.media.variants.open({ tenant: T1, ref, target: { ...TARGET, maxWidth } })
    ok(await open(20))
    ok(await open(10))
    ok(await open(20))
    ok(await open(5))
    ok(await open(10))
    expect(w.image.fits).toEqual(['20x20', '10x20', '5x20', '10x20'])
  })
})

describe('reads', () => {
  const ORIGINAL = {
    mediaType: 'image/png',
    bytes: 11,
    facts: { kind: 'image', widthPixels: 40, heightPixels: 30 },
  }
  const page = (w: ReturnType<typeof world>, ref: never, offset: number, limit: number) =>
    w.media.reads.page({ tenant: T1, ref, offset, limit, target: null })

  it('pages through the bytes of a medium, at most one part at a time, and says what is paged', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    expect(ok(await page(w, ref as never, 0, 100))).toEqual({
      part: IMAGE.subarray(0, 8),
      next: 8,
      ...ORIGINAL,
    })
    expect(ok(await page(w, ref as never, 8, 2))).toEqual({
      part: IMAGE.subarray(8, 10),
      next: 10,
      ...ORIGINAL,
    })
    expect(ok(await page(w, ref as never, 10, 8))).toEqual({
      part: IMAGE.subarray(10),
      next: null,
      ...ORIGINAL,
    })
    expect(ok(await page(w, ref as never, 99, 8))).toEqual({
      part: new Uint8Array(),
      next: null,
      ...ORIGINAL,
    })
  })

  it('pages a version for display out of the version, made once, with its own type, size and facts', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const shown = (offset: number, limit: number) =>
      w.media.reads.page({ tenant: T1, ref, offset, limit, target: TARGET })
    const version = {
      mediaType: 'image/webp',
      bytes: 10,
      facts: { kind: 'image', widthPixels: 20, heightPixels: 20 },
    }
    const first = ok(await shown(0, 4))
    expect(first).toEqual({ part: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), next: 4, ...version })
    expect(ok(await shown(4, 100))).toEqual({
      part: new Uint8Array([0x0d, 0x0a, 0x1a, 0x0a, 20, 20]),
      next: null,
      ...version,
    })
    expect(ok(await shown(10, 4))).toEqual({ part: new Uint8Array(), next: null, ...version })
    expect(w.image.fits).toEqual(['20x20'])
  })

  it('pages the original for a target the original is already within, and makes nothing', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const roomy = { ...TARGET, maxWidth: 40, maxHeight: 30 }
    expect(
      ok(await w.media.reads.page({ tenant: T1, ref, offset: 8, limit: 8, target: roomy })),
    ).toEqual({ part: IMAGE.subarray(8), next: null, ...ORIGINAL })
    expect(w.image.fits).toEqual([])
  })

  it('pages the original for a target it is exactly within, and a version once it is over in bytes, in width or in height', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const exact = { mediaTypes: ['image/png'], maxBytes: 11, maxWidth: 40, maxHeight: 30 }
    const paged = async (target: typeof exact) =>
      ok(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target })).mediaType
    expect(await paged(exact)).toBe('image/png')
    for (const over of [{ maxBytes: 10 }, { maxWidth: 39 }, { maxHeight: 29 }]) {
      const opened = ok(
        await w.media.variants.open({
          tenant: T1,
          ref,
          target: { ...exact, ...over, mediaTypes: ['image/png', 'image/webp'] },
        }),
      )
      expect(opened.mediaType).toBe('image/webp')
    }
    expect(w.image.fits).toHaveLength(3)
  })

  it('a page of no bytes has no next page', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    expect(ok(await page(w, ref as never, 0, 0))).toMatchObject({
      part: new Uint8Array(),
      next: null,
    })
  })

  it('reads the whole object once to check it, and only the range after that', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const opens: unknown[] = []
    w.faults.hooks.set('open', async (real, ...args) => {
      opens.push(args[1])
      return real(...args)
    })
    ok(await page(w, ref as never, 0, 8))
    ok(await page(w, ref as never, 8, 8))
    expect(opens).toEqual([undefined, { offset: 0, length: 8 }, { offset: 8, length: 8 }])
  })

  it('after the object was checked: a store that left is unavailable, bytes that are gone are no material', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    ok(await page(w, ref as never, 0, 8))
    w.withdrawStore()
    expect(await page(w, ref as never, 0, 8)).toEqual({
      failure: { kind: 'unavailable', dependency: 'store' },
    })
    w.returnStore()
    w.medium.sealed.delete(ref.key)
    expect(await page(w, ref as never, 0, 8)).toEqual({ failure: { kind: 'material-unavailable' } })
  })

  it('a version that cannot be made because the store is off is unavailable, not too large', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    w.faults.methods.set('open', 'unavailable')
    expect(
      await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: TARGET }),
    ).toEqual({ failure: { kind: 'unavailable', dependency: 'store' } })
  })

  it('answers too large for a target no version fits', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const tight = { ...TARGET, maxBytes: 5 }
    expect(
      await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: tight }),
    ).toEqual({ failure: { kind: 'too-large' } })
  })

  it('hand nothing out when the bytes no longer match the digest (ME-1)', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    w.medium.sealed.set(ref.key, png(40, 30, 8))
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toEqual({
      failure: { kind: 'material-unavailable' },
    })
    expect(
      await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: null }),
    ).toEqual({
      failure: { kind: 'material-unavailable' },
    })
  })

  it('find no material when the bytes are gone from the store', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    w.medium.sealed.delete(ref.key)
    expect(failureOf(await w.media.variants.open({ tenant: T1, ref, target: null }))).toBe(
      'material-unavailable',
    )
    expect(
      failureOf(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: null })),
    ).toBe('material-unavailable')
  })
  it('answer unavailable, not that the material is gone, while the store is off', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const storeOff = { failure: { kind: 'unavailable', dependency: 'store' } }
    w.faults.methods.set('open', 'unavailable')
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toEqual(storeOff)
    expect(
      await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: null }),
    ).toEqual(storeOff)
    w.faults.methods.clear()
    ok(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: null }))
    w.faults.methods.set('open', 'unavailable')
    expect(
      await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: null }),
    ).toEqual(storeOff)
  })

  it('answer unavailable while the index is off', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    w.faults.index = 'unavailable'
    const indexOff = { failure: { kind: 'unavailable', dependency: 'index' } }
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toEqual(indexOff)
    expect(
      await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8, target: null }),
    ).toEqual(indexOff)
  })
})
