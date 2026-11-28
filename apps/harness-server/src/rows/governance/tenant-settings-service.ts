import { Service, type Context } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createTenantSettings,
  type AssetTarget,
  type SettingView,
  type TenantSettings,
  type TenantSettingsAssetRef,
} from '@omne-harness/settings'
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { PermissionDeclaration } from '../../entry/permission-declarations.ts'
import type { ToolRelease } from '../../entry/tool-release.ts'
import type { DeclaredAsset } from '../settings/tenant-secrets.ts'
import { createSettingsGuard, type CardsReader } from '../authorization/settings-access.ts'
import { actingAdmit, createActingSettings, type ActingSettings } from './acting-settings.ts'
import type { TenantGovernanceHost } from './tenant-host.ts'
import { createTenantSettingsPermissions } from './tenant-settings-permissions.ts'

type Face = TenantSettings<unknown>

/** @owner apps/harness-server/src/rows/governance */
export abstract class TenantSettingsService extends Service implements Face {
  static readonly provide = 'tenantSettings'
  constructor(ctx: Context) {
    super(ctx, TenantSettingsService.provide)
  }
  abstract readonly list: Face['list']
  abstract readonly describe: Face['describe']
  abstract readonly set: Face['set']
  abstract readonly clear: Face['clear']
}
export const tenantSettingsKey = TenantSettingsService.provide

/** @owner apps/harness-server/src/rows/governance */
export abstract class TenantActingSettingsService extends Service implements ActingSettings {
  static readonly provide = 'tenantActingSettings'
  constructor(ctx: Context) {
    super(ctx, TenantActingSettingsService.provide)
  }
  abstract readonly list: ActingSettings['list']
  abstract readonly write: ActingSettings['write']
}
export const tenantActingSettingsKey = TenantActingSettingsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantSettings: TenantSettingsService
    tenantAssetSettings: TenantAssetSettingsService
    tenantActingSettings: TenantActingSettingsService
  }
}

// A write whose outcome is not known counts: what a row kept may be stale after it.
function writeCounts() {
  const counts = new Map<string, number>()
  const keyOf = (tenant: TenantId) => {
    const encoded = tenantCodec.encode(tenant)
    return encoded.ok ? encoded.value : undefined
  }
  return {
    of: (tenant: TenantId) => counts.get(keyOf(tenant) ?? '') ?? 0,
    async counted(tenant: TenantId, write: Promise<Awaited<ReturnType<Face['set']>>>) {
      const outcome = await write
      const key = keyOf(tenant)
      if (key !== undefined && (outcome.kind === 'written' || outcome.kind === 'unknown'))
        counts.set(key, (counts.get(key) ?? 0) + 1)
      return outcome
    },
  }
}
type WriteCounts = ReturnType<typeof writeCounts>

class TenantSettingsImpl extends TenantSettingsService {
  readonly list: Face['list']
  readonly describe: Face['describe']
  readonly set: Face['set']
  readonly clear: Face['clear']
  constructor(ctx: Context, face: Face, writes: WriteCounts) {
    super(ctx)
    this.list = input => face.list(input)
    this.describe = input => face.describe(input)
    this.set = input => writes.counted(input.tenant, face.set(input))
    this.clear = input => writes.counted(input.tenant, face.clear(input))
  }
}

class TenantActingSettingsImpl extends TenantActingSettingsService {
  readonly list: ActingSettings['list']
  readonly write: ActingSettings['write']
  constructor(ctx: Context, acting: ActingSettings, writes: WriteCounts) {
    super(ctx)
    this.list = input => acting.list(input)
    this.write = input => writes.counted(input.tenant, acting.write(input))
  }
}

export type TenantSettingsServiceOptions = Readonly<{
  host: Pick<TenantGovernanceHost, 'settings' | 'assets'>
  scope: Pick<GovernanceScope, 'deploymentId' | 'logicalServiceId'>
  storage: Pick<SqlStorage, 'read'>
  release(): ToolRelease | undefined
  declared?(tenantRef: string): readonly PermissionDeclaration[]
  identity: Readonly<{ verifier: PrincipalVerifier; standing: TenantStandingSource }>
  active(): boolean
  /** Where a card answer is read back; absent, no session work sets a tenant setting. */
  cards?: CardsReader
}>

const unavailable = { kind: 'rejected', reason: 'unavailable' } as const

export function settingsHoldingOf(host: Pick<TenantGovernanceHost, 'assets'>) {
  return async (
    tenant: TenantId,
    target: AssetTarget,
  ): Promise<TenantSettingsAssetRef | undefined> => {
    const tenantRef = tenantCodec.encode(tenant)
    const assets = tenantRef.ok ? await host.assets(tenantRef.value) : undefined
    if (assets === undefined) throw new Error('the assets of the tenant are unavailable')
    const read = await assets.readHolding({
      holdingRef: target.holdingRef,
      scopeRef: target.scopeRef,
    })
    if (read.kind === 'absent') return undefined
    if (read.kind !== 'holding') throw new Error(`the holding cannot be read: ${read.reason}`)
    return read.holding.state === 'held'
      ? { category: read.holding.category, name: read.holding.name }
      : undefined
  }
}

type Admit = Parameters<typeof createTenantSettings<unknown>>[0]['principals']['admit']

function guardedAdmit(options: TenantSettingsServiceOptions): Admit {
  const admission = referenceAdmissionCheck({ ...options.identity, permits: null })
  const { cards } = options
  const guard = createSettingsGuard(
    () => (options.active() ? admission : undefined),
    cards === undefined ? undefined : () => (options.active() ? cards() : undefined),
  )
  return async input => (await guard.qualify(input)).kind
}

export function createTenantSettingsFace(
  options: TenantSettingsServiceOptions,
  admit: Admit = guardedAdmit(options),
): Face {
  const settingsOf = async (tenant: TenantId) => {
    const tenantRef = tenantCodec.encode(tenant)
    return tenantRef.ok ? options.host.settings(tenantRef.value) : undefined
  }
  return createTenantSettings<unknown>({
    deploymentRef: options.scope.deploymentId,
    principals: { admit },
    catalog: {
      async read(tenant, request) {
        const settings = await settingsOf(tenant)
        return settings === undefined ? unavailable : settings.read(request)
      },
      holdingOf: settingsHoldingOf(options.host),
    },
    permissions: createTenantSettingsPermissions(options),
    writer: {
      async write(input) {
        const settings = await settingsOf(input.tenant)
        return settings === undefined ? unavailable : settings.writer.write(input)
      },
    },
  })
}

/** Provides the settings face people use, and the read of an asset's settings the release's rows use. */
export function provideTenantSettings(ctx: Context, options: TenantSettingsServiceOptions) {
  const writes = writeCounts()
  new TenantSettingsImpl(ctx, createTenantSettingsFace(options), writes)
  new TenantAssetSettingsImpl(
    ctx,
    createTenantSettingsFace(options, async () => (options.active() ? 'allowed' : 'unavailable')),
    writes,
    declaredOf(options),
  )
  const acting = actingAdmit(options.identity, options.active)
  new TenantActingSettingsImpl(
    ctx,
    createActingSettings(createTenantSettingsFace(options, input => acting(input))),
    writes,
  )
}

export type AssetSettingsQuery = Readonly<{ tenant: TenantId; category: string }>

/** @owner apps/harness-server/src/rows/governance */
export abstract class TenantAssetSettingsService extends Service {
  static readonly provide = 'tenantAssetSettings'
  constructor(ctx: Context) {
    super(ctx, TenantAssetSettingsService.provide)
  }
  /** Every setting of the tenant's assets of one category in one read; `unknown` when not read whole. */
  abstract readonly items: (
    query: AssetSettingsQuery,
  ) => Promise<readonly SettingView[] | 'unknown'>
  /** Moves at each write of the tenant's settings through this process. */
  abstract readonly writes: (tenant: TenantId) => number
  /** The assets the tenant holds, each with the settings definition governance installed for it. */
  abstract readonly declared: (tenant: TenantId) => Promise<readonly DeclaredAsset[] | 'unknown'>
}

function declaredOf(options: TenantSettingsServiceOptions): TenantAssetSettingsService['declared'] {
  const holdingOf = settingsHoldingOf(options.host)
  return async tenant => {
    const tenantRef = tenantCodec.encode(tenant)
    const settings = tenantRef.ok ? await options.host.settings(tenantRef.value) : undefined
    if (settings === undefined) return 'unknown'
    try {
      const basis = await settings.read({
        deploymentRef: options.scope.deploymentId,
        mode: 'management',
        targets: [],
        selectionRef: null,
      })
      if ('kind' in basis || basis.completeness !== 'complete') return 'unknown'
      const found: DeclaredAsset[] = []
      for (const view of basis.views) {
        if (view.target.kind !== 'asset') continue
        const asset = await holdingOf(tenant, view.target)
        const { providerId, definitionId } = view.definition
        if (asset !== undefined)
          found.push({
            ref: { asset, holding: { providerId, definitionId } },
            definition: view.definition,
          })
      }
      return found
    } catch {
      return 'unknown'
    }
  }
}
export const tenantAssetSettingsKey = TenantAssetSettingsService.provide

const ITEMS_PAGE = 100

class TenantAssetSettingsImpl extends TenantAssetSettingsService {
  readonly items: TenantAssetSettingsService['items']
  readonly writes: TenantAssetSettingsService['writes']
  readonly declared: TenantAssetSettingsService['declared']
  constructor(
    ctx: Context,
    face: Face,
    writes: WriteCounts,
    declared: TenantAssetSettingsService['declared'],
  ) {
    super(ctx)
    this.items = async ({ tenant, category }) => {
      const found: SettingView[] = []
      let after: string | null = null
      do {
        const page = await face.list({
          principal: null,
          tenant,
          scope: { kind: 'asset', category },
          after,
          limit: ITEMS_PAGE,
        })
        if (page.kind !== 'listed' || page.completeness !== 'complete') return 'unknown'
        found.push(...page.items)
        after = page.next
      } while (after !== null)
      return found
    }
    this.writes = tenant => writes.of(tenant)
    this.declared = declared
  }
}
