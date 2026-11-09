// The `settings` row (application assembly, Settings secret items): the registry of the setting
// definitions the release tools declare, the secret-item entry of `@omne-harness/settings` over
// the trusted custody, and the admitted setting management the public operations use. It provides
// the trusted key `settingsSecretItems`: a service in the shape of server-entry's
// `SettingsGovernance`, which only the `server-entry` row reads, per call.
//
// Registration follows the release: a tool's definition, declarations included, is known to this
// process only after the `tool-host` row loaded its author (`releaseDefinitionOf`). The row keeps
// no copy of its own and asks for it on every read of the registry: a definition that became known
// since the last read is registered then, under the holding `toolSettingProjection` derives from it.
// The registry closes with the row, so a reloaded row starts from an empty table (IC-13).
//
// Why the key is defined here: like `modelCredentialCustody`, the provider and its one consumer are
// rows of this application, and settings has no Cordis entry. When a member outside this
// application needs the key, it moves to the `./cordis` entry of the member that then owns it.
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import type { SettingsGovernance } from '@omne-harness/server-entry'
import {
  createSettingsRegistry,
  createSettingsSecretItems,
  type SettingDefinitions,
  type SettingsAssetQuery,
  type SettingsHolding,
  type SettingsHoldingRef,
  type SettingsRegistrySnapshot,
} from '@omne-harness/settings'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { releaseDefinitionOf, releaseOf } from '../../entry/tool-release.ts'
import { defineRow } from '../../row.ts'
import { createSettingsGuard } from '../authorization/settings-access.ts'
import { settingsSecretCustodyKey } from '../secret-custody/index.ts'
import { createSettingsGovernance } from './governance.ts'
import { toolSettingProjection } from './holding.ts'

/** @owner apps/harness-server/src/rows/settings */
export abstract class SettingsSecretItemsService extends Service implements SettingsGovernance {
  static readonly provide = 'settingsSecretItems'
  constructor(ctx: Context) {
    super(ctx, SettingsSecretItemsService.provide)
  }
  abstract readonly list: SettingsGovernance['list']
  abstract readonly set: SettingsGovernance['set']
  abstract readonly describe: SettingsGovernance['describe']
  abstract readonly clear: SettingsGovernance['clear']
}
export const settingsSecretItemsKey = SettingsSecretItemsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    settingsSecretItems: SettingsSecretItemsService
  }
}

/** The asset category of every holding this row resolves: the release tools. */
export const TOOL_ASSET_CATEGORY = 'tool'

const LOGGER = 'settings'

// The service keeps closures only: a method reached through a caller proxy has a `this` that is
// not the instance (docs/real-mode.md).
class SettingsSecretItemsImpl extends SettingsSecretItemsService {
  readonly list: SettingsGovernance['list']
  readonly set: SettingsGovernance['set']
  readonly describe: SettingsGovernance['describe']
  readonly clear: SettingsGovernance['clear']
  constructor(ctx: Context, delegate: SettingsGovernance) {
    super(ctx)
    this.list = input => delegate.list(input)
    this.set = input => delegate.set(input)
    this.describe = input => delegate.describe(input)
    this.clear = input => delegate.clear(input)
  }
}

/** The verifier and the standing source of the tree, read on every call (as `model-credential` does). */
function identityPorts(ctx: Context) {
  const verifier: PrincipalVerifier = {
    verify: value => {
      const current: PrincipalVerifier | undefined = ctx.get(principalVerifierKey)
      return current === undefined
        ? Promise.resolve({ kind: 'unavailable', diagnostic: 'principal verifier absent' })
        : current.verify(value)
    },
  }
  const standing: TenantStandingSource = {
    read: input => {
      const current: TenantStandingSource | undefined = ctx.get(tenantStandingKey)
      if (current === undefined) throw new Error('tenant standing is not installed')
      return current.read(input)
    },
  }
  return { verifier, standing }
}

type Known =
  | Readonly<{ kind: 'holding'; registrationId: number; holding: SettingsHolding }>
  | Readonly<{ kind: 'no-settings' }>
  | Readonly<{ kind: 'refused' }>

/**
 * The registry of this row, kept in step with the release definitions this process knows. Every
 * read registers the definitions that became known since the last read; a tool that declares no
 * settings or whose declaration the registry refuses is remembered so that it is not tried again
 * and the refusal is logged once. `holdings` is the `resolve` of the secret-item entry.
 */
export function createReleaseSettingsRegistry(ctx: Context) {
  const release = releaseOf(ctx)
  const capacity = release.kind === 'trusted' ? Math.max(1, release.manifest.entries.length) : 1
  const registry = createSettingsRegistry({ capacity })
  const known = new Map<string, Known>()

  const register = (name: string): void => {
    if (known.has(name)) return
    const definition = releaseDefinitionOf(ctx, name)
    if (definition === undefined) return
    let projected: SettingDefinitions | null
    try {
      projected = toolSettingProjection(definition)
    } catch {
      known.set(name, { kind: 'refused' })
      ctx
        .logger(LOGGER)
        .warn('settings of the release tool %s were not registered: %s', name, 'projection threw')
      return
    }
    if (projected === null) {
      known.set(name, { kind: 'no-settings' })
      return
    }
    const registered = registry.registerContribution(projected)
    if (registered.kind === 'registered') {
      const holding = { providerId: projected.providerId, definitionId: projected.definitionId }
      known.set(name, { kind: 'holding', registrationId: registered.registrationId, holding })
      return
    }
    known.set(name, { kind: 'refused' })
    ctx
      .logger(LOGGER)
      .warn('settings of the release tool %s were not registered: %s', name, registered.kind)
  }

  const sync = (): void => {
    const current = releaseOf(ctx)
    if (current.kind !== 'trusted') return
    for (const entry of current.manifest.entries) register(entry.asset.name)
  }

  const snapshot = (): SettingsRegistrySnapshot => {
    sync()
    return registry.snapshot()
  }

  const holdings = (asset?: SettingsAssetQuery): readonly SettingsHoldingRef[] => {
    sync()
    const refs: SettingsHoldingRef[] = []
    for (const [name, entry] of known) {
      if (entry.kind !== 'holding') continue
      if (asset !== undefined) {
        if (asset.name !== name) continue
        if (asset.category !== undefined && asset.category !== TOOL_ASSET_CATEGORY) continue
      }
      refs.push({ asset: { category: TOOL_ASSET_CATEGORY, name }, holding: entry.holding })
    }
    return refs
  }

  return Object.freeze({ snapshot, holdings, close: () => registry.close() })
}

const plugin: Plugin.Object = {
  name: 'settings',
  inject: [settingsSecretCustodyKey],
  apply(ctx: Context) {
    const registry = createReleaseSettingsRegistry(ctx)
    ctx.effect(() => () => registry.close(), 'settings.registry')
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'settings.active',
    )
    const items = createSettingsSecretItems({
      declarations: { snapshot: () => registry.snapshot() },
      custody: ctx.settingsSecretCustody,
      resolve: asset => registry.holdings(asset),
    })
    const { verifier, standing } = identityPorts(ctx)
    const admission = referenceAdmissionCheck({ verifier, standing, permits: null })
    const guard = createSettingsGuard(() => (active ? admission : undefined))
    new SettingsSecretItemsImpl(
      ctx,
      createSettingsGovernance({
        items,
        qualify: input => guard.qualify(input),
        now: readSystemInstant,
      }),
    )
  },
}

export const settingsRow = defineRow({
  row: 'settings',
  implementation: 'real',
  manifest: {
    provides: [settingsSecretItemsKey],
    injects: [settingsSecretCustodyKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
