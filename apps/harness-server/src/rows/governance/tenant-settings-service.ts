import { Service, type Context } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createTenantSettings,
  type SettingsTargetView,
  type TenantSettings,
  type TenantSettingsAssetRef,
} from '@omne-harness/settings'
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { createSettingsGuard } from '../authorization/settings-access.ts'
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

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantSettings: TenantSettingsService
  }
}

class TenantSettingsImpl extends TenantSettingsService {
  readonly list: Face['list']
  readonly describe: Face['describe']
  readonly set: Face['set']
  readonly clear: Face['clear']
  constructor(ctx: Context, face: Face) {
    super(ctx)
    this.list = input => face.list(input)
    this.describe = input => face.describe(input)
    this.set = input => face.set(input)
    this.clear = input => face.clear(input)
  }
}

export type TenantSettingsServiceOptions = Readonly<{
  host: Pick<TenantGovernanceHost, 'settings' | 'assets'>
  scope: Pick<GovernanceScope, 'deploymentId' | 'logicalServiceId'>
  storage: Pick<SqlStorage, 'read'>
  release(): ToolRelease | undefined
  identity: Readonly<{ verifier: PrincipalVerifier; standing: TenantStandingSource }>
  active(): boolean
}>

const unavailable = { kind: 'rejected', reason: 'unavailable' } as const

export function heldAssetOf(host: Pick<TenantGovernanceHost, 'assets'>) {
  return async (
    tenant: TenantId,
    view: SettingsTargetView,
  ): Promise<TenantSettingsAssetRef | undefined> => {
    if (view.target.policyId !== 'asset') return undefined
    const tenantRef = tenantCodec.encode(tenant)
    const assets = tenantRef.ok ? await host.assets(tenantRef.value) : undefined
    if (assets === undefined) throw new Error('the assets of the tenant are unavailable')
    const read = await assets.readHolding({
      holdingRef: view.target.targetRef,
      scopeRef: view.target.scopeRef,
    })
    if (read.kind === 'absent') return undefined
    if (read.kind !== 'holding') throw new Error(`the holding cannot be read: ${read.reason}`)
    return read.holding.state === 'held'
      ? { category: read.holding.category, name: read.holding.name }
      : undefined
  }
}

export function createTenantSettingsFace(options: TenantSettingsServiceOptions): Face {
  const admission = referenceAdmissionCheck({ ...options.identity, permits: null })
  const guard = createSettingsGuard(() => (options.active() ? admission : undefined))
  const settingsOf = async (tenant: TenantId) => {
    const tenantRef = tenantCodec.encode(tenant)
    return tenantRef.ok ? options.host.settings(tenantRef.value) : undefined
  }
  return createTenantSettings<unknown>({
    deploymentRef: options.scope.deploymentId,
    principals: {
      async admit(input) {
        return (await guard.qualify(input)).kind
      },
    },
    catalog: {
      async read(tenant, request) {
        const settings = await settingsOf(tenant)
        return settings === undefined ? unavailable : settings.read(request)
      },
      assetOf: heldAssetOf(options.host),
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

export function provideTenantSettings(ctx: Context, options: TenantSettingsServiceOptions) {
  return new TenantSettingsImpl(ctx, createTenantSettingsFace(options))
}
