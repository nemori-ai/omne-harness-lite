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
  items: SettingsSecretItems
  qualify(
    input: Readonly<{
      principal: unknown
      tenant: SettingsAccess['tenant']
      action: SettingsAction
    }>,
  ): Promise<SettingsVerdict>
  now(): SystemInstant
}>

type Admitted =
  | Readonly<{ kind: 'scope'; scope: SecretScope }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable' }>

const OFFICIAL: SecretScope = { layer: 'official' }

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

function layerOf(presence: SecretPresence): SettingLayerState {
  if (presence.kind === 'unbound') return { state: 'unbound' }
  const state =
    presence.life === 'active' ? 'usable' : presence.life === 'revoked' ? 'revoked' : 'unreadable'
  return presence.configuredAt === null ? { state } : { state, configuredAt: presence.configuredAt }
}

function stateOf(presence: SecretPresence, tenantId: SettingsAccess['tenant']): SettingState {
  const layer = layerOf(presence)
  return layer.state === 'unbound' ? layer : { ...layer, tenantId }
}

function itemKey(view: SecretItemView): string {
  return JSON.stringify([view.asset.category, view.asset.name, view.itemId])
}

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
        if (shown === undefined) return { kind: 'basis-unavailable' }
        items.push(shown)
      }
      return { kind: 'succeeded', items }
    },

    async set({ access, asset, item, secret }): Promise<SettingsSetOutcome> {
      const admitted = await admit(access, 'set')
      if (admitted.kind !== 'scope') return admitted
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
