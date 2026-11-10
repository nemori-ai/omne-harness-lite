// The `settings` row (application assembly, Settings secret items): the registry of the setting
// definitions the official holdings declare, the secret-item entry of `@omne-harness/settings`
// over the trusted custody, and the admitted setting management the public operations use. It
// provides the trusted key `settingsSecretItems`: a service in the shape of server-entry's
// `SettingsGovernance`, which only the `server-entry` row reads, per call.
//
// Registration follows the release. The model providers are fixed bodies of the release
// (`releaseProviders`): each table registers them when it starts. A tool's definition,
// declarations included, is known to this process only after the `tool-host` row loaded its
// author (`releaseDefinitionOf`). The row keeps
// no copy of its own and asks for it on every read of the registry: a definition that became known
// since the last read is registered then, under the holding `officialHolding` derives from its
// asset. The row knows no category: every holding comes from the category hooks of `src/assets/`.
// The table belongs to one release generation: when the release authority reloads at another
// generation, the table is closed and a new one starts, so the definitions of the new generation
// register again. The registry closes with the row, so a reloaded row starts from an empty table
// (IC-13).
//
// Why the key is defined here: the provider and its one consumer are rows of this application,
// and settings has no Cordis entry. When a member outside this application needs the key, it
// moves to the `./cordis` entry of the member that then owns it.
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import type { SettingsGovernance } from '@omne-harness/server-entry'
import {
  createSettingsRegistry,
  createSettingsSecretItems,
  type SettingsAssetQuery,
  type SettingsHoldingRef,
  type SettingsRegistrySnapshot,
} from '@omne-harness/settings'
import { releaseProviders } from '../../assets/model-providers.ts'
import { officialHolding, toolAsset, type OfficialHolding } from '../../assets/official-holdings.ts'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { releaseDefinitionOf, releaseOf, type ToolRelease } from '../../entry/tool-release.ts'
import { defineRow } from '../../row.ts'
import { createSettingsGuard } from '../authorization/settings-access.ts'
import { settingsSecretCustodyKey } from '../secret-custody/index.ts'
import { createSettingsGovernance } from './governance.ts'

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
  | Readonly<{ kind: 'holding'; ref: SettingsHoldingRef }>
  | Readonly<{ kind: 'no-settings' }>
  | Readonly<{ kind: 'refused' }>

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>

/**
 * The table of one release generation: its registry, the holdings of the release providers, and
 * what it registered or refused by tool name.
 */
type Table = Readonly<{
  generation: string | null
  registry: ReturnType<typeof createSettingsRegistry>
  providers: readonly SettingsHoldingRef[]
  known: Map<string, Known>
}>

function tableOf(release: ToolRelease): Table {
  const declared = releaseProviders().flatMap(provider =>
    provider.holding === null ? [] : [provider.holding],
  )
  const tools = release.kind === 'trusted' ? release.manifest.entries.length : 0
  const registry = createSettingsRegistry({ capacity: Math.max(1, tools + declared.length) })
  for (const held of declared) {
    const registered = registry.registerContribution(held.definition)
    if (registered.kind !== 'registered')
      throw new Error(`the settings of the release provider ${held.ref.asset.name} are refused`)
  }
  return {
    generation: release.kind === 'trusted' ? release.generation : null,
    registry,
    providers: declared.map(held => held.ref),
    known: new Map(),
  }
}

/**
 * The registry of this row, kept in step with the release definitions this process knows. Every
 * read registers the definitions that became known since the last read; a tool that declares no
 * settings or whose declaration the registry refuses is remembered so that it is not tried again
 * and the refusal is logged once. The table is the one of the current release generation: a
 * trusted release at another generation closes it and starts a new one. `holdings` is the
 * `resolve` of the secret-item entry.
 */
export function createReleaseSettingsRegistry(ctx: Context) {
  let table = tableOf(releaseOf(ctx))

  const register = (release: Trusted, name: string): void => {
    const { registry, known } = table
    if (known.has(name)) return
    const definition = releaseDefinitionOf(ctx, name)
    if (definition === undefined) return
    let held: OfficialHolding
    try {
      held = officialHolding(toolAsset(definition))
    } catch {
      held = { kind: 'rejected', reason: 'the asset body could not be read' }
    }
    if (held.kind === 'none') {
      known.set(name, { kind: 'no-settings' })
      return
    }
    const registered =
      held.kind === 'declared' ? registry.registerContribution(held.definition) : held
    if (held.kind === 'declared' && registered.kind === 'registered') {
      known.set(name, { kind: 'holding', ref: held.ref })
      return
    }
    known.set(name, { kind: 'refused' })
    ctx
      .logger(LOGGER)
      .warn(
        'settings of the release tool %s (generation %s) were not registered: %s',
        name,
        release.generation,
        'reason' in registered ? registered.reason : registered.kind,
      )
  }

  const sync = (): void => {
    const current = releaseOf(ctx)
    if (current.kind !== 'trusted') return
    if (current.generation !== table.generation) {
      table.registry.close()
      table = tableOf(current)
    }
    for (const entry of current.manifest.entries) register(current, entry.asset.name)
  }

  const snapshot = (): SettingsRegistrySnapshot => {
    sync()
    return table.registry.snapshot()
  }

  const holdings = (asset?: SettingsAssetQuery): readonly SettingsHoldingRef[] => {
    sync()
    const matches = (ref: SettingsHoldingRef): boolean =>
      asset === undefined ||
      (asset.name === ref.asset.name &&
        (asset.category === undefined || asset.category === ref.asset.category))
    const refs = table.providers.filter(matches)
    for (const entry of table.known.values())
      if (entry.kind === 'holding' && matches(entry.ref)) refs.push(entry.ref)
    return refs
  }

  return Object.freeze({ snapshot, holdings, close: () => table.registry.close() })
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
