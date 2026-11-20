import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ByteStore } from '@omne-harness/media-contract'
import {
  MediaService,
  MediaStoresService,
  mediaImageKey,
  mediaIndexKey,
  mediaStoresKey,
} from '@omne-harness/media-cordis-contract/cordis'
import { createMedia, type MediaConfig } from './index.ts'

/** The byte stores of this tree, by name. A store leaves when the plugin that registered it does. */
export class MediaStoresProvider extends MediaStoresService {
  private readonly stores: ByteStore[] = []

  protected contribute(store: ByteStore): () => void {
    if (this.stores.some(known => known.name === store.name))
      throw new TypeError(`a byte store named "${store.name}" is registered`)
    this.stores.push(store)
    return () => void this.stores.splice(this.stores.indexOf(store), 1)
  }

  current(): readonly ByteStore[] {
    return this.stores
  }
}

export type MediaPluginClass = {
  new (ctx: Context): MediaService
  readonly inject: readonly string[]
}

/** The custody over the ports of the tree. The stores are read at each call; an operation cut short is one a crash leaves. */
export function createMediaPlugin(
  input: Readonly<{ config: MediaConfig; writeTo: string }>,
): MediaPluginClass {
  return class MediaProvider extends MediaService {
    static readonly inject = [mediaStoresKey, mediaIndexKey, mediaImageKey]
    readonly uploads: MediaService['uploads']
    readonly custody: MediaService['custody']
    readonly variants: MediaService['variants']
    readonly reads: MediaService['reads']

    constructor(ctx: Context) {
      super(ctx)
      const registry = ctx.mediaStores
      const media = createMedia({
        get stores() {
          return registry.current()
        },
        writeTo: input.writeTo,
        index: ctx.mediaIndex,
        image: ctx.mediaImage,
        clock: {
          now: () =>
            /* wall-clock: clock-source -- the clock of the custody in this tree: expiry of uploads and staged media */ new Date().toISOString(),
        },
        newKey: () => randomBytes(16).toString('hex'),
        config: input.config,
      })
      this.uploads = media.uploads
      this.custody = media.custody
      this.variants = media.variants
      this.reads = media.reads
    }
  }
}
