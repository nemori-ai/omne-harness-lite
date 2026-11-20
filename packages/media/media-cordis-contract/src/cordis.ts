import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  ByteStore,
  Custody,
  ImageCodec,
  Media,
  MediaIndex,
  Reads,
  Uploads,
  Variants,
} from '@omne-harness/media-contract'

/** The custody of media in this tree. */
export abstract class MediaService extends Service implements Media {
  static readonly provide = 'media'

  constructor(ctx: Context) {
    super(ctx, MediaService.provide)
  }

  abstract readonly uploads: Uploads
  abstract readonly custody: Custody
  abstract readonly variants: Variants
  abstract readonly reads: Reads
}
export const mediaKey = MediaService.provide

/** The extension point `media.stores`: byte stores by name. Registering is the effect of the caller. */
export abstract class MediaStoresService extends Service {
  static readonly provide = 'mediaStores'

  constructor(ctx: Context) {
    super(ctx, MediaStoresService.provide)
  }

  register(store: ByteStore): void {
    this.ctx.effect(() => this.contribute(store), 'mediaStores.register')
  }

  protected abstract contribute(store: ByteStore): () => void
  abstract current(): readonly ByteStore[]
}
export const mediaStoresKey = MediaStoresService.provide

/** The metadata port, given by one provider. */
export abstract class MediaIndexService extends Service {
  static readonly provide = 'mediaIndex'

  constructor(ctx: Context) {
    super(ctx, MediaIndexService.provide)
  }

  abstract readonly index: MediaIndex
}
export const mediaIndexKey = MediaIndexService.provide

/** The image port, given by one provider. */
export abstract class MediaImageService extends Service {
  static readonly provide = 'mediaImage'

  constructor(ctx: Context) {
    super(ctx, MediaImageService.provide)
  }

  abstract readonly codec: ImageCodec
}
export const mediaImageKey = MediaImageService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    media: MediaService
    mediaStores: MediaStoresService
    mediaIndex: MediaIndexService
    mediaImage: MediaImageService
  }
}
