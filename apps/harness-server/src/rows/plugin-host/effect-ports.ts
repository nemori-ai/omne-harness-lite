import type { Context } from '@deepseek-ai/cordis'
import { scopeOfLayer, type CategoryView } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { CATALOG, list, lockOver, type Contract, type Registry } from '@omne-harness/dynamis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  listedPlugins,
  type KnownPoint,
  type PluginEffectPorts,
} from '@omne-harness/plugin-host-local'
import { pluginReportsKey, type PluginReportsService } from '../plugin-access/reports-service.ts'
import { pluginServerKey, type PluginServerService } from '../plugin-server/service.ts'
import { tenantAssetsKey, type TenantAssetsService } from '../tenant-assets/service.ts'
import { heldPluginPorts } from './held-ports.ts'

/** The points of the server tree: a category's point takes what the category is made from, another what it declared. */
export function serverPointsOf(
  registry: Registry | undefined,
  categories: Pick<CategoryView, 'atPoint'> | undefined,
): readonly KnownPoint[] {
  const declared = registry === undefined ? undefined : list<Contract>(registry, CATALOG, null, [])
  if (declared?.kind !== 'read') return []
  return declared.items.map(({ entry }): KnownPoint => {
    const { name, item, binding } = entry.item
    const category = categories?.atPoint(name)
    const made = category !== undefined && 'creation' in category ? category.creation : 'none'
    const takes = made === 'none' ? (item.kind === 'data' ? 'data' : 'code') : made
    return { name, side: 'server', takes, when: binding === 'run' ? 'running' : 'build' }
  })
}

/** What the Plugin category asks of this tree to tell of its own. Each is read at the call, not held. */
export function pluginEffectPorts(ctx: Context): PluginEffectPorts {
  const assets = (): TenantAssetsService | undefined =>
    ctx.get(tenantAssetsKey) as TenantAssetsService | undefined
  return {
    async listed(tenant) {
      const held = assets()
      if (held === undefined) return { kind: 'unavailable' }
      return listedPlugins(heldPluginPorts(held), tenant)
    },
    serverPoints: () =>
      serverPointsOf(
        (ctx.get(dynamisKey) as DynamisService | undefined)?.registry(),
        ctx.get(assetCategoriesKey)?.view,
      ),
    clients: tenant =>
      (ctx.get(pluginReportsKey) as PluginReportsService | undefined)?.reportsOf(tenant),
    server: tenant => {
      const loading = ctx.get(pluginServerKey) as PluginServerService | undefined
      return loading === undefined ? null : (loading.states(tenant) ?? new Map())
    },
    lockedBy: (tenant, point, key) => {
      const registry = (ctx.get(dynamisKey) as DynamisService | undefined)?.registry()
      if (registry === undefined) return undefined
      return lockOver(registry, point, key, scopeOfLayer('tenant', tenant))?.fiber
    },
  }
}
