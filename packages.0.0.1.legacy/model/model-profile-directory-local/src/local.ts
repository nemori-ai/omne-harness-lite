import { StorageDefect, StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { DiagnosticSink, OfficialManifest } from '@omne-harness-lite/model-profile-directory'
import type { ModelProfileRef } from '@omne-harness-lite/model-profile'
import { CatalogImplementation, OperationOwner } from './runtime.ts'
import type { MembershipsRead } from './types.ts'

/** Actual dependencies, not a serialized plugin configuration or a governance mirror. */
export interface LocalModelDirectoryOptions {
  readonly storage: AtomicStorage
  readonly clock: Clock
  readonly memberships: MembershipsRead
  readonly manifest: OfficialManifest
  readonly factoryConfigured: boolean
  readonly diagnostics: DiagnosticSink
  readonly onDiagnosticFailure: () => void
  readonly withdrawn: (ref: ModelProfileRef) => void
}

/** Same directory implementation as the Cordis facade. Original owner exists before readiness. */
export function createLocalModelDirectory(options: LocalModelDirectoryOptions) {
  const owner = new OperationOwner(options.diagnostics, options.onDiagnosticFailure)
  const catalog = new CatalogImplementation({
    storage: options.storage,
    clock: options.clock,
    memberships: options.memberships,
    factoryConfigured: options.factoryConfigured,
    notify: ref => {
      try {
        options.withdrawn(ref)
      } catch {
        owner.record({
          operation: 'profile.withdrawn',
          phase: 'notification',
          outcome: 'listener_failed',
        })
      }
    },
    owner,
  })
  const ready = (async () => {
    const result = await owner.execute('loadManifest', async () => {
      await catalog.ready()
      const loaded = await catalog.loadManifest(options.manifest)
      if ('failure' in loaded) {
        if (loaded.failure !== 'manifestNotNewer')
          throw new StorageDefect('official model manifest unavailable')
        owner.record({ operation: 'loadManifest', phase: 'error', outcome: 'manifestNotNewer' })
      }
      return Object.freeze(catalog.management)
    })
    if ('failure' in result)
      throw new StorageUnavailable('model directory initialization unavailable')
    return result
  })()
  void ready.catch(() => {})
  return Object.freeze({ ready, close: () => owner.close() })
}
