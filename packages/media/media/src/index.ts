import type { Media } from '@omne-harness/media-contract'
import { createCustody } from './custody.ts'
import type { MediaDependencies } from './deps.ts'
import { createObjects } from './objects.ts'
import { createReads } from './reads.ts'
import { createRepresentations } from './representations.ts'
import { createUploads } from './uploads.ts'

export type { ConversionConfig, MediaConfig, MediaDependencies } from './deps.ts'
export { createEngineRegistry, type EngineRegistration, type EngineRegistry } from './engines.ts'

/** The custody of media over its ports, with no Cordis, storage or image library in it. A store is found by name at each call. */
export function createMedia(deps: MediaDependencies): Media {
  const objects = createObjects(deps)
  return {
    uploads: createUploads(deps, objects),
    custody: createCustody(deps, objects),
    ...createReads(deps, objects),
    representations: createRepresentations(deps, objects),
  }
}
