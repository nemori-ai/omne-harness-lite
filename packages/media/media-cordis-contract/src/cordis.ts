import { heldPoint } from '@omne-harness/assets'
import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  ByteStore,
  ConverterDefinitions,
  ConverterEngine,
  Custody,
  EngineLease,
  Engines,
  ImageCodec,
  Media,
  MediaIndex,
  Reads,
  Representations,
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
  abstract readonly representations: Representations
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

export type EngineRegistration = Readonly<{ release(): Promise<void> }>

/**
 * The extension point `media.engines`: converter engines by name, one for a name. Registering is
 * the effect of the caller: the engine is withdrawn when the scope of the caller ends.
 * @owner packages/media/media-cordis-contract
 */
export abstract class MediaEnginesService extends Service implements Engines {
  static readonly provide = 'mediaEngines'

  constructor(ctx: Context) {
    super(ctx, MediaEnginesService.provide)
  }

  register(engine: ConverterEngine): EngineRegistration {
    let registration: EngineRegistration | undefined
    this.ctx.effect(() => {
      const made = this.contribute(engine)
      registration = made
      return () => void made.release()
    }, 'mediaEngines.register')
    if (registration === undefined) throw new Error('mediaEngines.register did not run')
    return registration
  }

  protected abstract contribute(engine: ConverterEngine): EngineRegistration
  abstract borrow(name: string): EngineLease | null
}
export const mediaEnginesKey = MediaEnginesService.provide

/**
 * The port that says which converter definition is in force, given by one provider.
 * @owner packages/media/media-cordis-contract
 */
export abstract class MediaConverterDefinitionsService
  extends Service
  implements ConverterDefinitions
{
  static readonly provide = 'mediaConverterDefinitions'

  constructor(ctx: Context) {
    super(ctx, MediaConverterDefinitionsService.provide)
  }

  abstract readonly resolve: ConverterDefinitions['resolve']
}
export const mediaConverterDefinitionsKey = MediaConverterDefinitionsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    media: MediaService
    mediaEngines: MediaEnginesService
    mediaConverterDefinitions: MediaConverterDefinitionsService
    mediaStores: MediaStoresService
    mediaIndex: MediaIndexService
    mediaImage: MediaImageService
  }
}

/** The point of the category: each layer's held definitions are its items. */
export const mediaConvertersPoint = heldPoint({
  name: 'media.converters',
  key: 'the converter name',
  summary: 'The converter definitions each layer holds, by name.',
})
