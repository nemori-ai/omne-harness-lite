import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { scopeOfLayer } from '@omne-harness/assets'
import { assetCategoriesKey, assetChangesKey } from '@omne-harness/assets-cordis-contract'
import type { AssetChanges } from '@omne-harness/assets-cordis-contract/cordis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  createServerSide,
  heldPlugins,
  serverInstall,
  type HeldPlugin,
  type ServerEntry,
  type ServerPoint,
} from '@omne-harness/plugin-host-local'
import { fiberOf, wantedOf, type Wanted } from '@omne-harness/plugin-protocol'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { defineRow } from '../../row.ts'
import { heldPluginPorts } from '../plugin-host/held-ports.ts'
import { serverPointsOf } from '../plugin-host/effect-ports.ts'
import { openRegisteredTenants } from '../registered-tenants.ts'
import { tenantAssetsKey, type TenantAssetsService } from '../tenant-assets/service.ts'
import { fileFloor } from './floor-file.ts'
import { followTenants } from './following.ts'
import { loadHeldFile, type HeldRef } from './load.ts'
import { providePluginServer, pluginServerKey } from './service.ts'

export const pluginServerRowConfig = z.strictObject({ floorDirectory: z.string().min(1) })

const assetsOf = (ctx: Context) => ctx.get(tenantAssetsKey) as TenantAssetsService | undefined

/** What a point of this tree is to a plugin now: the owner of a category's point is the category. */
function pointOf(ctx: Context, name: string): ServerPoint | undefined {
  const categories = ctx.get(assetCategoriesKey)?.view
  const registry = (ctx.get(dynamisKey) as DynamisService | undefined)?.registry()
  const known = serverPointsOf(registry, categories).find(point => point.name === name)
  if (known === undefined) return undefined
  if (categories?.atPoint(name) !== undefined) return { kind: 'category' }
  const takes = known.takes === 'data' ? 'data' : 'code'
  return { kind: 'takes', takes, when: known.when === 'running' ? 'running' : 'build' }
}

/** Where the fibers of plugins grow: below this row, with the one trusted name it sees isolated away. */
export const pluginParent = (ctx: Context): Context =>
  ctx.isolate(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)

/** Puts the entries of one plugin as a fiber of its own; disposing the fiber takes them back. */
async function putAs(
  parent: Context,
  name: string,
  entries: readonly ServerEntry[],
): Promise<() => unknown> {
  let put = false
  const fiber = parent.plugin({
    name,
    inject: [dynamisKey],
    apply(inner: Context) {
      ;(inner.get(dynamisKey) as DynamisService).put(entries)
      put = true
    },
  })
  try {
    await fiber.await()
  } catch (error) {
    await fiber.dispose()
    throw error
  }
  if (!put) {
    await fiber.dispose()
    throw new Error('the registry is not there now')
  }
  return () => fiber.dispose()
}

/** Plugins on the server: what each tenant holds is loaded here, each plugin a fiber, under the floor of the server. */
export const pluginServerRow = defineRow({
  row: 'plugin-server',
  implementation: 'real',
  manifest: {
    provides: [pluginServerKey],
    injects: [
      dynamisKey,
      tenantAssetsKey,
      assetChangesKey,
      tenantDomainsKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'business' },
  async body(ctx: Context, raw) {
    const config = pluginServerRowConfig.parse(raw)
    const logger = ctx.logger('plugin-server')
    const warn = (message: string): void => logger.warn(message)
    const bare = pluginParent(ctx)
    const floor = fileFloor({ directory: config.floorDirectory, warn })
    const refs = new Map<string, ReadonlyMap<string, HeldRef>>()
    const install = (tenant: string, wanted: Wanted) => {
      const held = refs.get(tenant)?.get(`${wanted.name}\n${wanted.version}`)
      return serverInstall({
        scope: scopeOfLayer('tenant', tenant),
        point: name => pointOf(ctx, name),
        guestForm: () => undefined,
        async load(file) {
          if (held === undefined) throw new Error('the tenant no longer holds this version')
          return loadHeldFile((await assetsOf(ctx)?.open(tenant))?.packages, held, file)
        },
        put: entries => putAs(bare, fiberOf(wanted.name, wanted.version), entries),
      })(wanted)
    }
    const side = createServerSide({ floor, install })
    providePluginServer(ctx, tenant => side.states(tenant))
    const converge = (tenant: string, plugins: readonly HeldPlugin[]): void => {
      refs.set(tenant, new Map(plugins.map(each => [`${each.name}\n${each.version}`, each.held])))
      side.converge(tenant, wantedOf(plugins, 'server'))
    }
    const following = followTenants({
      async read(tenant) {
        const assets = assetsOf(ctx)
        const standing = await assets?.standing(tenant)
        if (assets === undefined || standing === 'unknown') return undefined
        if (standing === 'unregistered') return []
        const read = await heldPlugins(heldPluginPorts(assets), tenant)
        return read.kind === 'read' ? read.plugins : undefined
      },
      converge,
      subscribe: (tenant, changed) =>
        (ctx.get(assetChangesKey) as AssetChanges).subscribe(tenant, {
          changed,
          closed: () => undefined,
        }),
      warn,
    })
    let discovering: Promise<unknown> | undefined
    let again = false
    const discover = (): void => {
      if (discovering !== undefined) return void (again = true)
      const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
      const principal: unknown = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
      discovering = openRegisteredTenants('plugin loading', {
        listing: () => directory.enumerate({ principal }),
        open: tenant => following.follow(tenant),
        warn,
      }).finally(() => {
        discovering = undefined
        if (again) discover()
        again = false
      })
    }
    // A tenant registered after the start shows on the registry once its assets are opened.
    ctx.on('dynamis-cordis/changed', discover)
    ctx.effect(() => {
      const first = setTimeout(discover, 0)
      return () => {
        clearTimeout(first)
        following.close()
      }
    }, 'plugin-server.follow')
    return {
      async stop() {
        following.close()
        await side.stop()
        floor.close()
        return { kind: 'settled' as const }
      },
    }
  },
})
