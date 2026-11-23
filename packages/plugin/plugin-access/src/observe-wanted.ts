import { createChangeObservation, type FrameSource } from '@omne-harness/access-cordis-contract'
import type { PluginProtocol } from '@omne-harness/plugin-protocol'
import { actingFor, tenantText } from './acting.ts'
import type { PluginSource, TargetTenantPrincipals } from './ports.ts'

type ObserveWanted = PluginProtocol['observations']['observe-wanted']

/** Frames that say only that what is to load may have changed; the client reads the list again. */
export function createWantedObservation(
  input: Readonly<{ principals: TargetTenantPrincipals; source: PluginSource }>,
): FrameSource<ObserveWanted> {
  return createChangeObservation<ObserveWanted>({
    async admits(login, open) {
      const acted = await actingFor(input.principals, login, tenantText(open.tenant))
      if (!('outcome' in acted)) return 'admitted'
      return acted.outcome === 'denied' ? 'denied' : 'basis-unavailable'
    },
    subscribe: (_open, listener) => input.source.subscribe(() => listener.changed()),
    frame: { kind: 'changed' },
  })
}
