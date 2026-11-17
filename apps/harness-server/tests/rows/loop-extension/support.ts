import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import { capabilityId, digestBytes, type PackageReader } from '@omne-harness/assets'
import { LOOP_EXTENSION_CATEGORY, RUN_SETTING } from '@omne-harness/loop-extension-contract'
import type { SettingsBasis } from '@omne-harness/settings'
import type { TenantHoldings } from '../../../src/rows/governance/tenant-holdings.ts'

export const assetOf = (name: string) => `tenant/${LOOP_EXTENSION_CATEGORY}/${name}`
export const holdingOf = (name: string) => `${LOOP_EXTENSION_CATEGORY}.${name}`

export function packageOf(files: Readonly<Record<string, string>>): PackageReader {
  const bytes = new Map(
    Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)] as const),
  )
  return {
    async manifest() {
      const entries = [...bytes].map(([path, value]) => ({
        path,
        bytes: value.length,
        digest: digestBytes(value),
      }))
      return { ok: { entries } }
    },
    async open(path) {
      const found = bytes.get(path)
      return found === undefined ? { failure: 'entry-not-found' } : { ok: found }
    },
  }
}

/** Publishes a package of one extension to the tenant with the library operation, and returns the version it got. */
export async function publish(
  holdings: TenantHoldings,
  declaration: LoopExtensionDeclaration,
  files: Readonly<Record<string, string>> = {},
): Promise<string> {
  const capability = capabilityId(LOOP_EXTENSION_CATEGORY, declaration.name)
  if (!capability.ok) throw new Error('not a capability identity')
  const published = await holdings.assets.packages.publish({
    capability: capability.id,
    assetRef: assetOf(declaration.name),
    from: packageOf({ ...files, 'extension.json': JSON.stringify(declaration) }),
    operationId: `publish-${declaration.name}-${Date.now()}`,
  })
  if (published.kind !== 'published') throw new Error(JSON.stringify(published))
  return published.version
}

export async function hold(holdings: TenantHoldings, tenantRef: string, name: string) {
  const held = await holdings.assets.hold({
    operationId: `hold-${name}`,
    holdingRef: holdingOf(name),
    scopeRef: tenantRef,
    assetRef: assetOf(name),
    selection: { kind: 'follow' },
    sources: [
      { sourceId: 'tenant', ownerRef: tenantRef, scope: { kind: 'tenant', subjectRef: tenantRef } },
    ],
    grants: [],
  })
  if (held.kind !== 'committed') throw new Error(JSON.stringify(held))
}

/**
 * The release has no way yet for a tenant to write a plain setting of an asset that is not a tool.
 * This stands in for that one write: it answers the real settings with `run` set for the named
 * extensions, and gives the signal a settings writer gives after its commit. The assets stay real.
 */
export function runSwitch(real: TenantHoldings) {
  const on = new Set<string>()
  const listeners = new Set<() => void>()
  const value = { kind: 'value' as const, value: true }
  const settings: TenantHoldings['settings'] = {
    writer: real.settings.writer,
    async read(request) {
      const basis = await real.settings.read(request)
      if ('kind' in basis) return basis
      const views = basis.views.map(view =>
        on.has(view.target.targetRef)
          ? {
              ...view,
              state: {
                ...view.state,
                sources: [
                  { id: 'tenant', values: [{ itemId: RUN_SETTING, value, locked: false }] },
                ],
              },
            }
          : view,
      )
      return { ...basis, views } satisfies SettingsBasis
    },
    changes: {
      subscribe(listener) {
        const leave = real.settings.changes.subscribe(listener)
        const own = () =>
          listener({ domain: { policyId: 'asset', scopeRef: '', targetRef: '' }, revision: 0 })
        listeners.add(own)
        return () => {
          leave()
          listeners.delete(own)
        }
      },
    },
  }
  return {
    holdings: { assets: real.assets, settings } satisfies TenantHoldings,
    set(name: string, run: boolean) {
      if (run) on.add(holdingOf(name))
      else on.delete(holdingOf(name))
      for (const listener of listeners) listener()
    },
  }
}
