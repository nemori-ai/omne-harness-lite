import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SecretSettings } from './ports.ts'
import {
  createSettingsRegistry,
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
import { tenantAssetSettingsKey } from '../governance/tenant-settings-service.ts'
import { createSecretSettings } from './secret-settings.ts'
import { tenantSecretItems } from './tenant-secrets.ts'

/** @owner apps/harness-server/src/rows/settings */
export abstract class SettingsSecretItemsService extends Service implements SecretSettings {
  static readonly provide = 'settingsSecretItems'
  constructor(ctx: Context) {
    super(ctx, SettingsSecretItemsService.provide)
  }
  abstract readonly list: SecretSettings['list']
  abstract readonly set: SecretSettings['set']
  abstract readonly describe: SecretSettings['describe']
  abstract readonly clear: SecretSettings['clear']
  /** Moves at each write of the tenant's secrets through this process; one whose outcome is not known counts. */
  abstract readonly writes: (tenant: TenantId) => number
}
export const settingsSecretItemsKey = SettingsSecretItemsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    settingsSecretItems: SettingsSecretItemsService
  }
}

const LOGGER = 'settings'

class SettingsSecretItemsImpl extends SettingsSecretItemsService {
  readonly list: SecretSettings['list']
  readonly set: SecretSettings['set']
  readonly describe: SecretSettings['describe']
  readonly clear: SecretSettings['clear']
  readonly writes: SettingsSecretItemsService['writes']
  constructor(ctx: Context, delegate: SecretSettings) {
    super(ctx)
    const counts = new Map<string, number>()
    const counted = async <T extends Readonly<{ kind: string }>>(
      tenant: TenantId,
      write: Promise<T>,
    ) => {
      const outcome = await write
      const key = tenantCodec.encode(tenant)
      if (key.ok && (outcome.kind === 'written' || outcome.kind === 'unknown'))
        counts.set(key.value, (counts.get(key.value) ?? 0) + 1)
      return outcome
    }
    this.list = input => delegate.list(input)
    this.set = input => counted(input.tenant, delegate.set(input))
    this.describe = input => delegate.describe(input)
    this.clear = input => counted(input.tenant, delegate.clear(input))
    this.writes = tenant => {
      const key = tenantCodec.encode(tenant)
      return key.ok ? (counts.get(key.value) ?? 0) : 0
    }
  }
}

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
    const items = tenantSecretItems({
      release: registry,
      custody: ctx.settingsSecretCustody,
      declared: async tenant => {
        const declared = await ctx.get(tenantAssetSettingsKey, false)?.declared(tenant)
        return declared ?? 'unknown'
      },
    })
    const { verifier, standing } = identityPorts(ctx)
    const admission = referenceAdmissionCheck({ verifier, standing, permits: null })
    const guard = createSettingsGuard(() => (active ? admission : undefined))
    new SettingsSecretItemsImpl(
      ctx,
      createSecretSettings({
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
