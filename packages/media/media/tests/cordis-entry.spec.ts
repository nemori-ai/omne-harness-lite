import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  createMemoryByteStore,
  createMemoryMediaIndex,
  createMemoryMedium,
} from '@omne-harness/media-contract/testing'
import {
  MediaImageService,
  MediaIndexService,
  mediaKey,
  mediaStoresKey,
} from '@omne-harness/media-cordis-contract/cordis'
import { MediaStoresProvider, createMediaPlugin } from '@omne-harness/media/cordis'
import { CONFIG, T1, fakeImage, holder, png } from './world.ts'

class Index extends MediaIndexService {
  private readonly port = createMemoryMediaIndex()
  readonly insertUploading = this.port.insertUploading
  readonly attachWrite = this.port.attachWrite
  readonly readUpload = this.port.readUpload
  readonly advance = this.port.advance
  readonly stageOrMerge = this.port.stageOrMerge
  readonly holdIfLive = this.port.holdIfLive
  readonly readLive = this.port.readLive
  readonly markDeleting = this.port.markDeleting
  readonly markDeletingIfExpired = this.port.markDeletingIfExpired
  readonly listDeleting = this.port.listDeleting
  readonly dropRow = this.port.dropRow
  readonly recordRepresentation = this.port.recordRepresentation
  readonly readRepresentation = this.port.readRepresentation
}
class Image extends MediaImageService {
  private readonly port = fakeImage().codec
  readonly probe = this.port.probe
  readonly fit = this.port.fit
}
const HOLDER = holder('call-1')

async function tree() {
  const ctx = new Context()
  const store = createMemoryByteStore(createMemoryMedium())
  await ctx.plugin(MediaStoresProvider)
  const index = await ctx.plugin(Index)
  await ctx.plugin(Image)
  await ctx.plugin(createMediaPlugin({ config: CONFIG, writeTo: store.name }))
  const stores = await ctx.plugin({
    name: 'memory-store',
    inject: [mediaStoresKey],
    apply: (inner: Context) => inner.mediaStores.register(store),
  })
  return { ctx, store, index, stores }
}
async function* one(bytes: Uint8Array) {
  yield bytes
}
const media = (ctx: Context) => {
  const service = ctx.get(mediaKey)
  if (service === undefined) throw new Error('the media service did not start')
  return service
}

describe('the media entry for Cordis', () => {
  it('exports the store registry and the custody plugin only', async () => {
    const cordis = (await import('@omne-harness/media/cordis')) as Record<string, unknown>
    expect(Object.keys(cordis).sort()).toEqual(['MediaStoresProvider', 'createMediaPlugin'])
  })

  it('keeps a product through the store, the index and the image port of the tree', async () => {
    const { ctx } = await tree()
    const bytes = png(2, 3)
    const put = await media(ctx).custody.put({
      tenant: T1,
      mediaType: 'image/png',
      bytes: one(bytes),
      holder: HOLDER,
    })
    if ('failure' in put) throw new Error(put.failure.kind)
    expect(put.ok.facts).toEqual({ kind: 'image', widthPixels: 2, heightPixels: 3 })
    const opened = await media(ctx).variants.open({ tenant: T1, ref: put.ok.ref, target: null })
    expect(opened).toMatchObject({ ok: { bytes } })
  })

  it('does not start without the registry and each port, and leaves with the port it reads', async () => {
    const ctx = new Context()
    await ctx.plugin(createMediaPlugin({ config: CONFIG, writeTo: 'memory' }))
    await ctx.plugin(MediaStoresProvider)
    await ctx.plugin(Image)
    expect(ctx.get(mediaKey)).toBeUndefined()
    const index = await ctx.plugin(Index)
    expect(ctx.get(mediaKey)).toBeDefined()
    await index.dispose()
    expect(ctx.get(mediaKey)).toBeUndefined()
  })

  it('answers unavailable once the store new objects go to is withdrawn, and works again when it is back', async () => {
    const { ctx, store, stores } = await tree()
    const product = () =>
      media(ctx).custody.put({
        tenant: T1,
        mediaType: 'image/png',
        bytes: one(png(4, 4)),
        holder: HOLDER,
      })
    await stores.dispose()
    expect(await product()).toEqual({ failure: { kind: 'unavailable', dependency: 'store' } })
    await ctx.plugin({
      name: 'memory-store-again',
      inject: [mediaStoresKey],
      apply: (inner: Context) => inner.mediaStores.register(store),
    })
    expect(await product()).toMatchObject({ ok: { ref: { storage: store.name } } })
  })

  it('refuses a second store of a name that is taken', async () => {
    const { ctx, store } = await tree()
    const second = async () =>
      ctx.plugin({
        name: 'same-name',
        inject: [mediaStoresKey],
        apply: (inner: Context) =>
          inner.mediaStores.register(createMemoryByteStore(createMemoryMedium())),
      })
    await expect(second()).rejects.toThrow(`a byte store named "${store.name}" is registered`)
    expect(ctx.mediaStores.current()).toEqual([store])
  })
})
