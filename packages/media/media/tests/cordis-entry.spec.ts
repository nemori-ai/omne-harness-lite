import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  createMemoryByteStore,
  createMemoryMediaIndex,
  createMemoryMedium,
} from '@omne-harness/media-contract/testing'
import {
  MediaImageService,
  MediaConverterDefinitionsService,
  MediaIndexService,
  mediaEnginesKey,
  mediaKey,
  mediaStoresKey,
} from '@omne-harness/media-cordis-contract/cordis'
import {
  MediaEnginesProvider,
  MediaStoresProvider,
  createMediaPlugin,
} from '@omne-harness/media/cordis'
import { createScriptedEngine } from '@omne-harness/media-contract/testing'
import { succeed } from '@omne-harness/operation-result'
import { CONFIG, T1, digestOf, fakeImage, holder, png, wav } from './world.ts'

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
class Definitions extends MediaConverterDefinitionsService {
  readonly resolve: MediaConverterDefinitionsService['resolve'] = async () =>
    succeed({
      kind: 'resolved',
      definition: { name: 'voice', revision: '1' },
      engine: 'voice.fixture',
      parameters: {},
      egress: { kind: 'in-process' },
    })
}
const HOLDER = holder('call-1')

async function tree() {
  const ctx = new Context()
  const store = createMemoryByteStore(createMemoryMedium())
  await ctx.plugin(MediaStoresProvider)
  const index = await ctx.plugin(Index)
  await ctx.plugin(Image)
  const timer = { after: () => () => undefined }
  await ctx.plugin(createMediaPlugin({ config: CONFIG, writeTo: store.name, timer }))
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
    expect(Object.keys(cordis).sort()).toEqual([
      'MediaEnginesProvider',
      'MediaStoresProvider',
      'createMediaPlugin',
    ])
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
    const timer = { after: () => () => undefined }
    await ctx.plugin(createMediaPlugin({ config: CONFIG, writeTo: 'memory', timer }))
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

  it('makes a representation ready through the engines and the definitions of the tree, each read at the call', async () => {
    const { ctx } = await tree()
    const bytes = wav(8)
    const tenant = T1
    const uploads = media(ctx).uploads
    await uploads.begin({
      tenant,
      upload: 'voice-1',
      mediaType: 'audio/wav',
      bytes: bytes.byteLength,
    })
    for (let at = 0, sequence = 0; at < bytes.byteLength; at += CONFIG.partBytes, sequence += 1)
      await uploads.append({
        tenant,
        upload: 'voice-1',
        sequence,
        part: bytes.subarray(at, at + CONFIG.partBytes),
      })
    const committed = await uploads.commit({ tenant, upload: 'voice-1', digest: digestOf(bytes) })
    if ('failure' in committed) throw new Error(JSON.stringify(committed.failure))
    const ensure = async () => {
      const signal = new AbortController().signal
      const access = { tenant, principal: null }
      const answer = await media(ctx).representations.ensure({
        access,
        ref: committed.ok.ref,
        signal,
      })
      return 'ok' in answer ? answer.ok : answer.failure
    }
    expect(await ensure()).toEqual({ kind: 'failed', reason: 'basis-unavailable' })
    const definitions = await ctx.plugin(Definitions)
    expect(await ensure()).toEqual({ kind: 'failed', reason: 'engine-unavailable' })
    await ctx.plugin(MediaEnginesProvider)
    expect(await ensure()).toEqual({ kind: 'failed', reason: 'engine-unavailable' })
    const { engine, calls } = createScriptedEngine(
      async () => ({ kind: 'failed', reason: 'error' }),
      { name: 'voice.fixture' },
    )
    const contributor = await ctx.plugin({
      name: 'voice-engine',
      inject: [mediaEnginesKey],
      apply: (inner: Context) => void inner.mediaEngines.register(engine),
    })
    expect(await ensure()).toEqual({ kind: 'failed', reason: 'engine-error' })
    expect(calls).toHaveLength(1)
    await contributor.dispose()
    expect(ctx.mediaEngines.borrow('voice.fixture')).toBeNull()
    expect(await ensure()).toEqual({ kind: 'failed', reason: 'engine-unavailable' })
    await definitions.dispose()
    expect(await ensure()).toEqual({ kind: 'failed', reason: 'basis-unavailable' })
  })

  it('refuses a second engine of a name that is taken, and gives the contributor only a receipt', async () => {
    const { ctx } = await tree()
    await ctx.plugin(MediaEnginesProvider)
    const { engine } = createScriptedEngine(async () => ({ kind: 'inconvertible' }))
    let receipt: unknown
    await ctx.plugin({
      name: 'first',
      inject: [mediaEnginesKey],
      apply: (inner: Context) => {
        receipt = inner.mediaEngines.register(engine)
      },
    })
    expect(Object.keys(receipt as object)).toEqual(['release'])
    const second = async () =>
      ctx.plugin({
        name: 'second',
        inject: [mediaEnginesKey],
        apply: (inner: Context) => void inner.mediaEngines.register({ ...engine }),
      })
    await expect(second()).rejects.toThrow(
      'a converter engine named "fixture.scripted" is registered',
    )
  })
})
