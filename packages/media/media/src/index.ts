import type { Media } from '@omne-harness/media-contract'
import { createCustody } from './custody.ts'
import type { MediaDependencies } from './deps.ts'
import { createObjects } from './objects.ts'
import { createReads } from './reads.ts'
import { createUploads } from './uploads.ts'

export type { MediaConfig, MediaDependencies } from './deps.ts'

/** The custody of media over a byte store and an index, with no Cordis, storage or image library in it. */
export function createMedia(deps: MediaDependencies): Media {
  if (!deps.stores.some(store => store.name === deps.writeTo))
    throw new Error(`media: no byte store is named "${deps.writeTo}"`)
  const objects = createObjects(deps)
  return {
    uploads: createUploads(deps, objects),
    custody: createCustody(deps, objects),
    ...createReads(deps, objects),
  }
}
