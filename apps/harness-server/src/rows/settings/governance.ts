// The `SettingsGovernance` port of server-entry (SPEC「设置项」) over the Settings secret-item entry.
// Every call is admitted first (`../authorization/settings-access.ts`). `set` and `clear` write the
// tenant scope of the admitted access and nothing else: a public operation never writes the
// official scope and never reaches the use face (I-2, I-6, I-8). `describe` and `list` read a secret
// item in both layers, the tenant's own and the official one that every legal tenant holds; a read
// that fails in either layer answers `basis-unavailable` (I-7). The entry's answers are mapped to
// the public outcomes here; the secret goes in through `set` and comes out of nothing.
import type {
  SettingItemView,
  SettingLayerState,
  SettingState,
} from '@omne-harness/public-contract'
import type {
  SettingsAccess,
  SettingsClearOutcome,
  SettingsDescribeOutcome,
  SettingsGovernance,
  SettingsListOutcome,
  SettingsSetOutcome,
} from '@omne-harness/server-entry'
import {
  parseSecretText,
  type SecretItemRefusal,
  type SecretItemView,
  type SecretPresence,
  type SecretScope,
  type SettingsSecretItems,
} from '@omne-harness/settings'
import { parseInstant } from '@omne-harness/utc-instant'
import type { SystemInstant } from '../../entry/session-clock.ts'
import type { SettingsAction, SettingsVerdict } from '../authorization/settings-access.ts'

export type SettingsGovernanceInput = Readonly<{
  /** The secret-item entry over the registered definitions and the custody. */
  items: SettingsSecretItems
  /** The admission of one action for one access. */
  qualify(
    input: Readonly<{
      principal: unknown
      tenant: SettingsAccess['tenant']
      action: SettingsAction
    }>,
  ): Promise<SettingsVerdict>
  /** The host time of a write, as checked instant text. */
  now(): SystemInstant
}>

type Admitted =
  | Readonly<{ kind: 'scope'; scope: SecretScope }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable' }>

const OFFICIAL: SecretScope = { layer: 'official' }

/** The public outcome of an answer the entry gives before it asks the custody. */
function refusal(kind: SecretItemRefusal): 'not-visible' | 'not-writable' | 'conflict' {
  switch (kind) {
    case 'undeclared':
      return 'not-visible'
    case 'not-secret':
      return 'not-writable'
    case 'conflict':
      return 'conflict'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

/** The public state of a presence in one layer: the life as the contract names it, the time if kept. */
function layerOf(presence: SecretPresence): SettingLayerState {
  if (presence.kind === 'unbound') return { state: 'unbound' }
  const state =
    presence.life === 'active' ? 'usable' : presence.life === 'revoked' ? 'revoked' : 'unreadable'
  return presence.configuredAt === null ? { state } : { state, configuredAt: presence.configuredAt }
}

/** The public state of a presence in the tenant's own layer: the layer state and the owner. */
function stateOf(presence: SecretPresence, tenantId: SettingsAccess['tenant']): SettingState {
  const layer = layerOf(presence)
  return layer.state === 'unbound' ? layer : { ...layer, tenantId }
}

/** The key of a listed item, to find the same item in the other layer. */
function itemKey(view: SecretItemView): string {
  return JSON.stringify([view.asset.category, view.asset.name, view.itemId])
}

/**
 * The public view of a listed item: a secret item shows its presence in both layers, an ordinary
 * one is not writable here. `undefined` when the official layer has no view of a secret item.
 */
function viewOf(
  view: SecretItemView,
  official: ReadonlyMap<string, SecretItemView>,
  tenantId: SettingsAccess['tenant'],
): SettingItemView | undefined {
  const base = { asset: view.asset, item: view.itemId, title: view.title }
  if (view.sensitivity !== 'secret')
    return { ...base, sensitivity: view.sensitivity, state: { state: 'not-writable' } }
  const other = official.get(itemKey(view))
  if (other?.sensitivity !== 'secret') return undefined
  return {
    ...base,
    sensitivity: 'secret',
    state: stateOf(view.presence, tenantId),
    official: layerOf(other.presence),
  }
}

export function createSettingsGovernance(input: SettingsGovernanceInput): SettingsGovernance {
  const admit = async (access: SettingsAccess, action: SettingsAction): Promise<Admitted> => {
    const verdict = await input.qualify({
      principal: access.principal,
      tenant: access.tenant,
      action,
    })
    if (verdict.kind === 'denied') return { kind: 'denied' }
    if (verdict.kind === 'unavailable') return { kind: 'basis-unavailable' }
    return { kind: 'scope', scope: { layer: 'tenant', tenant: access.tenant } }
  }

  const governance: SettingsGovernance = {
    async list({ access, asset }): Promise<SettingsListOutcome> {
      const admitted = await admit(access, 'list')
      if (admitted.kind !== 'scope') return admitted
      const listOf = (scope: SecretScope) =>
        input.items.items(asset === undefined ? { scope } : { scope, asset })
      const listed = listOf(admitted.scope)
      if (listed === 'denied') return { kind: 'denied' }
      if (listed === 'unavailable' || listed === 'conflict') return { kind: 'basis-unavailable' }
      const officialListed = listOf(OFFICIAL)
      if (typeof officialListed === 'string') return { kind: 'basis-unavailable' }
      const official = new Map(officialListed.map(view => [itemKey(view), view]))
      const items: SettingItemView[] = []
      for (const view of listed) {
        const shown = viewOf(view, official, access.tenant)
        // The declarations changed between the two reads: there is no consistent answer.
        if (shown === undefined) return { kind: 'basis-unavailable' }
        items.push(shown)
      }
      return { kind: 'succeeded', items }
    },

    async set({ access, asset, item, secret }): Promise<SettingsSetOutcome> {
      const admitted = await admit(access, 'set')
      if (admitted.kind !== 'scope') return admitted
      // The text is checked at the boundary; a text that is not a secret text is not written.
      const parsed = parseSecretText(secret)
      if (!parsed.ok) return { kind: 'not-writable' }
      const reading = input.now()
      const configuredAt = reading.ok ? parseInstant(reading.text) : undefined
      if (!reading.ok || configuredAt === undefined || !configuredAt.ok)
        return { kind: 'basis-unavailable' }
      const written = input.items.set({
        scope: admitted.scope,
        item: { asset, itemId: item },
        secret: parsed.value,
        at: configuredAt.value,
      })
      switch (written) {
        case 'written':
          return { kind: 'succeeded', configuredAt: configuredAt.value }
        case 'not-written':
          return { kind: 'basis-unavailable' }
        case 'unconfirmed':
          return { kind: 'unknown' }
        case 'denied':
          return { kind: 'denied' }
        default:
          return { kind: refusal(written) }
      }
    },

    async describe({ access, asset, item }): Promise<SettingsDescribeOutcome> {
      const admitted = await admit(access, 'describe')
      if (admitted.kind !== 'scope') return admitted
      const presence = input.items.describe({
        scope: admitted.scope,
        item: { asset, itemId: item },
      })
      if (typeof presence === 'string') {
        if (presence === 'denied') return { kind: 'denied' }
        if (presence === 'unavailable') return { kind: 'basis-unavailable' }
        return { kind: refusal(presence) }
      }
      const official = input.items.describe({ scope: OFFICIAL, item: { asset, itemId: item } })
      if (typeof official === 'string') return { kind: 'basis-unavailable' }
      return {
        kind: 'succeeded',
        setting: { own: stateOf(presence, access.tenant), official: layerOf(official) },
      }
    },

    async clear({ access, asset, item }): Promise<SettingsClearOutcome> {
      const admitted = await admit(access, 'clear')
      if (admitted.kind !== 'scope') return admitted
      const removed = input.items.clear({ scope: admitted.scope, item: { asset, itemId: item } })
      switch (removed) {
        case 'removed':
          return { kind: 'succeeded' }
        case 'absent':
          return { kind: 'no-change' }
        case 'not-written':
          return { kind: 'basis-unavailable' }
        case 'unconfirmed':
          return { kind: 'unknown' }
        case 'denied':
          return { kind: 'denied' }
        default:
          return { kind: refusal(removed) }
      }
    },
  }
  return Object.freeze(governance)
}
