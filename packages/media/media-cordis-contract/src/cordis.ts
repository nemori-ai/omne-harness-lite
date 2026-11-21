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

/**
 * The custody of media in this tree.
 * @owner packages/media/media-cordis-contract
 */
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

/**
 * The extension point `media.stores`: byte stores by name. Registering is the effect of the caller.
 * @owner packages/media/media-cordis-contract
 */
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

/**
 * The metadata port, given by one provider.
 * @owner packages/media/media-cordis-contract
 */
export abstract class MediaIndexService extends Service implements MediaIndex {
  static readonly provide = 'mediaIndex'

  constructor(ctx: Context) {
    super(ctx, MediaIndexService.provide)
  }

  abstract readonly insertUploading: MediaIndex['insertUploading']
  abstract readonly attachWrite: MediaIndex['attachWrite']
  abstract readonly readUpload: MediaIndex['readUpload']
  abstract readonly advance: MediaIndex['advance']
  abstract readonly stageOrMerge: MediaIndex['stageOrMerge']
  abstract readonly holdIfLive: MediaIndex['holdIfLive']
  abstract readonly readLive: MediaIndex['readLive']
  abstract readonly markDeleting: MediaIndex['markDeleting']
  abstract readonly markDeletingIfExpired: MediaIndex['markDeletingIfExpired']
  abstract readonly listDeleting: MediaIndex['listDeleting']
  abstract readonly dropRow: MediaIndex['dropRow']
  abstract readonly recordRepresentation: MediaIndex['recordRepresentation']
  abstract readonly readRepresentation: MediaIndex['readRepresentation']
}
export const mediaIndexKey = MediaIndexService.provide

/**
 * The image port, given by one provider.
 * @owner packages/media/media-cordis-contract
 */
export abstract class MediaImageService extends Service implements ImageCodec {
  static readonly provide = 'mediaImage'

  constructor(ctx: Context) {
    super(ctx, MediaImageService.provide)
  }

  abstract readonly probe: ImageCodec['probe']
  abstract readonly fit: ImageCodec['fit']
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
