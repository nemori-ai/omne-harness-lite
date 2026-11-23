import { createChangeObservation, type FrameSource } from '@omne-harness/access-cordis-contract'
import type { PluginProtocol } from '@omne-harness/plugin-protocol'
import { actingFor, tenantText } from './acting.ts'
import type { PluginReports, PluginSource, TargetTenantPrincipals } from './ports.ts'

type ObserveWanted = PluginProtocol['observations']['observe-wanted']

/** Frames that say only that what is to load may have changed. The client that observes is there for as long as it does. */
export function createWantedObservation(
  input: Readonly<{
    principals: TargetTenantPrincipals
    source: PluginSource
    reports: PluginReports
  }>,
): FrameSource<ObserveWanted> {
  return createChangeObservation<ObserveWanted>({
    async admits(login, open) {
      const acted = await actingFor(input.principals, login, tenantText(open.tenant))
      if (!('outcome' in acted)) return 'admitted'
      return acted.outcome === 'denied' ? 'denied' : 'basis-unavailable'
    },
    subscribe(open, listener) {
      const tenant = tenantText(open.tenant)
      const stop = input.source.subscribe(tenant, () => listener.changed())
      const leave = input.reports.present(tenant, open.client)
      return () => {
        stop()
        leave()
      }
    },
    frame: { kind: 'changed' },
  })
}
