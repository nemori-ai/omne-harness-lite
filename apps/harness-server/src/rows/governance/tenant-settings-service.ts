// The Cordis service `tenantSettings`: the tenant-layer face of `@omne-harness/settings` over the
// Settings of each tenant runtime of this row. The face checks the caller with the admission of the
// setting management (`rows/authorization/settings-access.ts`): only the login principal of the
// tenant. It reads the catalog of the tenant, writes its tenant layer and asks Permissions about a
// permission item through the adapters of this row.
//
// Why the key is defined here: the provider is this row, and no member outside this application
// reads it yet. When one does, the key moves to the `./cordis` entry of the member that owns it.
import { Service, type Context } from '@deepseek-ai/cordis'
import { canonicalText, referenceAdmissionCheck } from '@omne-harness/authorization'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createTenantSettings,
  type TenantSettings,
  type TenantSettingsAssetRef,
} from '@omne-harness/settings'
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { createSettingsGuard } from '../authorization/settings-access.ts'
import type { TenantGovernanceHost } from './tenant-host.ts'
import { createTenantSettingsPermissions } from './tenant-settings-permissions.ts'
import { toolAssetTarget } from './tool-installation-assets.ts'

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

// Closures only: a method reached through a caller proxy has another `this` (docs/real-mode.md).
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
  host: Pick<TenantGovernanceHost, 'settings'>
  scope: Pick<GovernanceScope, 'deploymentId' | 'logicalServiceId'>
  storage: Pick<SqlStorage, 'read'>
  release(): ToolRelease | undefined
  identity: Readonly<{ verifier: PrincipalVerifier; standing: TenantStandingSource }>
  /** False after the row stopped: the admission is then absent and every call is unavailable. */
  active(): boolean
}>

const unavailable = { kind: 'rejected', reason: 'unavailable' } as const

/** The face over the tenant runtimes of `host`. */
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
      assetOf(view): TenantSettingsAssetRef | undefined {
        const release = options.release()
        if (release?.kind !== 'trusted') return undefined
        const entry = release.manifest.entries.find(
          value =>
            canonicalText(toolAssetTarget(value, view.target.scopeRef)) ===
            canonicalText(view.target),
        )
        return entry === undefined ? undefined : { category: 'tool', name: entry.asset.name }
      },
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
