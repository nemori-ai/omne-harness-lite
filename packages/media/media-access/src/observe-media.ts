import {
  createChangeObservation,
  type ChangeAdmission,
  type FrameSource,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { MediaProtocol } from '@omne-harness/media-protocol'
import type { MediaFace, TargetTenantPrincipals } from './ports.ts'

type ObserveMedia = MediaProtocol['observations']['observe-media']

/** Frames that say the preprocessing of one medium changed, fed by the representations' own watch. */
export function createMediaObservation(
  input: Readonly<{ media: () => MediaFace | undefined; principals: TargetTenantPrincipals }>,
): FrameSource<ObserveMedia> {
  return createChangeObservation<ObserveMedia>({
    async admits(login, open): Promise<ChangeAdmission> {
      const text = tenantCodec.encode(open.tenant)
      if (!text.ok) return 'basis-unavailable'
      const issued = await input.principals.actingFor(login, text.value)
      return 'ok' in issued ? 'admitted' : issued.refused
    },
    subscribe(open, listener) {
      const media = input.media()
      if (media === undefined) return undefined
      const stop = new AbortController()
      const watching = media.representations.watch({ ...open, signal: stop.signal })
      void (async () => {
        try {
          for await (const _ of watching) listener.changed()
        } catch {
          // A watch that breaks is a watch that ended.
        }
        listener.closed()
      })()
      return () => stop.abort()
    },
    frame: { kind: 'changed' },
  })
}
