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
  it('pages through the bytes of a medium, at most one part at a time', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const first = ok(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 100 }))
    expect(first).toEqual({ part: IMAGE.subarray(0, 8), next: 8 })
    const second = ok(await w.media.reads.page({ tenant: T1, ref, offset: 8, limit: 2 }))
    expect(second).toEqual({ part: IMAGE.subarray(8, 10), next: 10 })
    expect(ok(await w.media.reads.page({ tenant: T1, ref, offset: 10, limit: 8 }))).toEqual({
      part: IMAGE.subarray(10),
      next: null,
    })
    expect(ok(await w.media.reads.page({ tenant: T1, ref, offset: 99, limit: 8 }))).toEqual({
      part: new Uint8Array(),
      next: null,
    })
  })

  it('hand nothing out when the bytes no longer match the digest (ME-1)', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    w.medium.sealed.set(ref.key, png(40, 30, 8))
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toEqual({
      failure: { kind: 'material-unavailable' },
    })
    expect(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8 })).toEqual({
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
    expect(failureOf(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8 }))).toBe(
      'material-unavailable',
    )
  })
  it('answer unavailable, not that the material is gone, while the store is off', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    const storeOff = { failure: { kind: 'unavailable', dependency: 'store' } }
    w.faults.methods.set('open', 'unavailable')
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toEqual(storeOff)
    expect(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8 })).toEqual(storeOff)
    w.faults.methods.clear()
    ok(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8 }))
    w.faults.methods.set('open', 'unavailable')
    expect(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8 })).toEqual(storeOff)
  })

  it('answer unavailable while the index is off', async () => {
    const w = world()
    const { ref } = await w.staged(T1, 'up', IMAGE)
    w.faults.index = 'unavailable'
    const indexOff = { failure: { kind: 'unavailable', dependency: 'index' } }
    expect(await w.media.variants.open({ tenant: T1, ref, target: null })).toEqual(indexOff)
    expect(await w.media.reads.page({ tenant: T1, ref, offset: 0, limit: 8 })).toEqual(indexOff)
  })
})
