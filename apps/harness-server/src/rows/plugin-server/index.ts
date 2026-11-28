import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { attributed } from '@omne-harness/assembly-cordis'
import { scopeOfLayer, type HeldItem } from '@omne-harness/assets'
import { assetCategoriesKey, assetChangesKey } from '@omne-harness/assets-cordis-contract'
import type { AssetChanges } from '@omne-harness/assets-cordis-contract/cordis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  adopt,
  ask,
  declare,
  lockOver,
  standingOf,
  type Binding,
  type Scope,
} from '@omne-harness/dynamis'
import {
  GUEST_FORMS_POINT,
  PORTS_POINT,
  createServerSide,
  guestFormsContract,
  heldPlugins,
  noMemberOf,
  portsContract,
  serverInstall,
  type GuestForm,
  type GuestFormItem,
  type HeldPlugin,
  type Needed,
  type PortCaller,
  type PortItem,
  type ServerEntry,
  type ServerPoint,
  PLUGIN_CATEGORY,
} from '@omne-harness/plugin-host-local'
import {
  bindPorts,
  fiberOf,
  wantedOf,
  type Absent,
  type Member,
  type PortFactory,
  type Wanted,
} from '@omne-harness/plugin-protocol'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { LAST_FALL_KEY, type Fall } from '../../process-fall.ts'
import { defineRow } from '../../row.ts'
import { heldPluginPorts } from '../plugin-host/held-ports.ts'
import { openRegisteredTenants } from '../registered-tenants.ts'
import { tenantAssetsKey, type TenantAssetsService } from '../tenant-assets/service.ts'
import { fileFloor } from './floor-file.ts'
import { followTenants } from './following.ts'
import { loadHeldFile, type HeldRef } from './load.ts'
import { providePluginServer, pluginServerKey } from './service.ts'

export const pluginServerRowConfig = z.strictObject({ floorDirectory: z.string().min(1) })

const assetsOf = (ctx: Context) => ctx.get(tenantAssetsKey) as TenantAssetsService | undefined
const fallMark = (tenant: string, fiber: string): string => JSON.stringify([tenant, fiber])
function fallOf(who: string | null | undefined): { tenant: string; fiber: string } | undefined {
  try {
    const [tenant, fiber] = JSON.parse(who ?? '') as unknown[]
    return typeof tenant === 'string' && typeof fiber === 'string' ? { tenant, fiber } : undefined
  } catch {
    return undefined
  }
}

const registryOf = (ctx: Context) => (ctx.get(dynamisKey) as DynamisService | undefined)?.registry()
const lockedBy = (
  registry: ReturnType<typeof registryOf>,
  point: string,
  key: string,
  id: string,
  scope: Scope,
): string | undefined =>
  registry === undefined ? undefined : lockOver(registry, point, key, id, scope)?.fiber

function guestFormOf(ctx: Context, point: string): GuestForm | undefined {
  const registry = registryOf(ctx)
  const answer = registry && ask<GuestFormItem>(registry, GUEST_FORMS_POINT, point, [])
  return answer?.kind === 'one' ? answer.entry.item.form : undefined
}

/** The port a plugin was loaded with: an owner that left lends nothing; a later generation of the same owner is pinned anew. */
function pinned(ctx: Context, scope: Scope, binding: Binding) {
  return (): PortFactory<PortCaller> | undefined => {
    const registry = registryOf(ctx)
    const now = registry && ask<PortItem>(registry, PORTS_POINT, binding.key, scope)
    if (now?.kind !== 'one' || now.entry.digest !== binding.digest) return undefined
    const { instance } = now.entry
    const same = instance.fiber === binding.instance.fiber
    return same && instance.generation >= binding.instance.generation
      ? now.entry.item.make
      : undefined
  }
}

/** Pins the ports a plugin of one tenant needs, in the scope of that tenant; each call opens them as its caller, for that tenant. */
function needsOf(ctx: Context, tenant: string, names: readonly string[]): Needed {
  const registry = registryOf(ctx)
  if (registry === undefined) return { kind: 'missing', names }
  const scope = scopeOfLayer('tenant', tenant)
  const references = Object.fromEntries(
    names.map(name => [name, { point: PORTS_POINT, anyOf: [name] }]),
  )
  const adopted = adopt(registry, references, scope)
  if (adopted.kind === 'unavailable')
    return { kind: 'missing', names: adopted.missing.map(each => each.slot) }
  const factories = Object.fromEntries(
    Object.entries(adopted.bindings).flatMap(([name, binding]) =>
      binding === null ? [] : [[name, pinned(ctx, scope, binding)]],
    ),
  )
  return { kind: 'adopted', bind: principal => bindPorts(factories, { principal, tenant }) }
}

type Placing = Readonly<{ directory(at: string): unknown; data(at: string): unknown }>

const nowhere = (): never => {
  throw new Error('nothing is placed here')
}
const NOWHERE: Placing = { directory: nowhere, data: nowhere }

function heldIn(held: HeldRef | undefined, plugin: string): Placing {
  const item = (where: Pick<HeldItem, 'within' | 'valueAt'>): HeldItem => {
    if (held === undefined) throw new Error('the tenant no longer holds this version')
    const { asset, version } = held
    return {
      asset,
      version,
      disabled: false,
      immutable: true,
      replaceLocked: false,
      from: `${PLUGIN_CATEGORY}:${plugin}`,
      ...where,
    }
  }
  return { directory: within => item({ within }), data: valueAt => item({ valueAt }) }
}

export function serverPointOf(
  ctx: Context,
  name: string,
  placing: Placing = NOWHERE,
): ServerPoint | undefined {
  const registry = (ctx.get(dynamisKey) as DynamisService | undefined)?.registry()
  const declared = registry === undefined ? undefined : standingOf(registry, name, [])
  if (declared?.kind !== 'declared') return undefined
  const category = ctx.get(assetCategoriesKey)?.view.atPoint(name)
  if (category === undefined) return { kind: 'point', rules: declared.contract }
  const made = 'creation' in category ? category.creation : 'none'
  const why = noMemberOf(category.category, made)
  const named = category.category
  if (why !== undefined)
    return { kind: 'category', category: named, takes: 'none', why, place: () => undefined }
  if (made === 'data')
    return { kind: 'category', category: named, takes: 'data', place: at => placing.data(at) }
  return {
    kind: 'category',
    category: named,
    takes: 'directory',
    place: at => placing.directory(at),
  }
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
    const fall = fallOf((ctx.get(LAST_FALL_KEY) as Fall | null | undefined)?.who)
    if (fall !== undefined) floor.fell(fall.tenant, fall.fiber)
    ;(ctx.get(dynamisKey) as DynamisService).put([
      declare(portsContract),
      declare(guestFormsContract),
    ])
    const refs = new Map<string, ReadonlyMap<string, HeldRef>>()
    const membersOf = new Map<string, readonly Member[]>()
    const install = (tenant: string, wanted: Wanted) => {
      const held = refs.get(tenant)?.get(`${wanted.name}\n${wanted.version}`)
      membersOf.set(fiberOf(wanted.name, wanted.version), wanted.members)
      return serverInstall({
        scope: scopeOfLayer('tenant', tenant),
        point: name => serverPointOf(ctx, name, heldIn(held, wanted.name)),
        guestForm: point => guestFormOf(ctx, point),
        needs: names => needsOf(ctx, tenant, names),
        async load(file) {
          if (held === undefined) throw new Error('the tenant no longer holds this version')
          return loadHeldFile((await assetsOf(ctx)?.open(tenant))?.packages, held, file)
        },
        put: entries => putAs(bare, fiberOf(wanted.name, wanted.version), entries),
        lockedBy: (point, key, id) =>
          lockedBy(registryOf(ctx), point, key, id, scopeOfLayer('tenant', tenant)),
        within: run => attributed(fallMark(tenant, fiberOf(wanted.name, wanted.version)), run),
      })(wanted)
    }
    const present = (tenant: string, lacks: readonly Absent[]): boolean =>
      lacks.every(({ kind, name }) =>
        kind === 'port'
          ? needsOf(ctx, tenant, [name]).kind === 'adopted'
          : serverPointOf(ctx, name) !== undefined,
      )
    const side = createServerSide({ floor, install, present })
    providePluginServer(
      ctx,
      tenant => side.states(tenant),
      fiber => membersOf.get(fiber),
    )
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
    ctx.on('dynamis-cordis/changed', () => side.recheck())
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
