import {
  parseSecretText,
  type SecretItemRefusal,
  type SecretItemView,
  type SecretPresence,
  type SecretScope,
  type SettingsAssetQuery,
  type SettingsSecretItems,
} from '@omne-harness/settings'
import { parseInstant } from '@omne-harness/utc-instant'
import type { SystemInstant } from '../../entry/session-clock.ts'
import type { SettingsAction, SettingsVerdict } from '../authorization/settings-access.ts'
import type {
  SecretClearOutcome,
  SecretItemInput,
  SecretSettings,
  SecretSetOutcome,
  SecretView,
} from './ports.ts'

export type SecretSettingsInput = Readonly<{
  /** The secret items a tenant can name: of the release, and of the assets it holds when `asset` needs them. */
  items(
    tenant: SecretItemInput['tenant'],
    asset: SettingsAssetQuery | undefined,
  ): Promise<SettingsSecretItems | 'unavailable'>
  qualify(
    input: Readonly<{
      principal: unknown
      tenant: SecretItemInput['tenant']
      action: SettingsAction
    }>,
  ): Promise<SettingsVerdict>
  now(): SystemInstant
}>

type Admitted =
  | Readonly<{ kind: 'scope'; scope: SecretScope; items: SettingsSecretItems }>
  | Readonly<{ kind: 'denied' | 'unavailable' }>

type Views = readonly SecretView[] | 'denied' | 'unavailable' | 'conflict'

const OFFICIAL: SecretScope = { layer: 'official' }
const WRITTEN = Object.freeze({ kind: 'written', revision: '0' } as const)

function refusal(kind: SecretItemRefusal): 'not-visible' | 'conflict' {
  return kind === 'conflict' ? 'conflict' : 'not-visible'
}

function stateOf(presence: SecretPresence): SecretView['own'] {
  if (presence.kind === 'unbound') return 'unset'
  if (presence.life === 'active') return 'available'
  return presence.life
}

function itemKey(view: SecretItemView): string {
  return JSON.stringify([view.asset.category, view.asset.name, view.itemId])
}

type Secret = Extract<SecretItemView, { sensitivity: 'secret' }>
const isSecret = (view: SecretItemView): view is Secret => view.sensitivity === 'secret'

function viewOf(own: Secret, official: Secret): SecretView {
  return {
    owner: { kind: 'asset', category: own.asset.category, name: own.asset.name },
    item: own.itemId,
    revision: '0',
    declaration: {
      title: own.title,
      purpose: own.purpose,
      appliesAt: own.appliesAt,
      clearEffect: own.clearEffect,
      group: own.group,
    },
    kind: 'secret',
    own: stateOf(own.presence),
    official: stateOf(official.presence),
    editable: { kind: 'yes' },
  }
}

function joined(
  own: readonly SecretItemView[],
  official: readonly SecretItemView[],
): readonly SecretView[] | 'unavailable' {
  const officials = new Map(official.filter(isSecret).map(view => [itemKey(view), view]))
  const views: SecretView[] = []
  for (const view of own.filter(isSecret)) {
    const other = officials.get(itemKey(view))
    if (other === undefined) return 'unavailable'
    views.push(viewOf(view, other))
  }
  return views
}

export function createSecretSettings(input: SecretSettingsInput): SecretSettings {
  const admit = async (
    access: Pick<SecretItemInput, 'principal' | 'tenant'>,
    action: SettingsAction,
    asset: SettingsAssetQuery | undefined,
  ): Promise<Admitted> => {
    const verdict = await input.qualify({
      principal: access.principal,
      tenant: access.tenant,
      action,
    })
    if (verdict.kind !== 'allowed') return verdict
    const items = await input.items(access.tenant, asset)
    if (items === 'unavailable') return { kind: 'unavailable' }
    return { kind: 'scope', scope: { layer: 'tenant', tenant: access.tenant }, items }
  }

  const viewsIn = (
    items: SettingsSecretItems,
    scope: SecretScope,
    asset: SettingsAssetQuery | undefined,
  ): Views => {
    const listOf = (layer: SecretScope) =>
      items.items(asset === undefined ? { scope: layer } : { scope: layer, asset })
    const own = listOf(scope)
    if (typeof own === 'string') return own
    const official = listOf(OFFICIAL)
    return typeof official === 'string' ? 'unavailable' : joined(own, official)
  }

  const configuredAt = () => {
    const reading = input.now()
    const parsed = reading.ok ? parseInstant(reading.text) : undefined
    return parsed?.ok === true ? parsed.value : undefined
  }

  const face: SecretSettings = {
    async list({ principal, tenant, asset }) {
      const admitted = await admit({ principal, tenant }, 'list', asset)
      if (admitted.kind !== 'scope') return admitted
      const views = viewsIn(admitted.items, admitted.scope, asset)
      if (views === 'conflict') return { kind: 'unavailable' }
      return typeof views === 'string' ? { kind: views } : { kind: 'listed', items: views }
    },

    async describe(access) {
      const admitted = await admit(access, 'describe', access.asset)
      if (admitted.kind !== 'scope') return admitted
      const views = viewsIn(admitted.items, admitted.scope, access.asset)
      if (typeof views === 'string') return { kind: views }
      const item = views.find(view => view.item === access.item)
      return item === undefined ? { kind: 'not-visible' } : { kind: 'described', item }
    },

    async set(access): Promise<SecretSetOutcome> {
      const admitted = await admit(access, 'set', access.asset)
      if (admitted.kind !== 'scope') return admitted
      const parsed = parseSecretText(access.secret)
      if (!parsed.ok) return { kind: 'invalid' }
      const at = configuredAt()
      if (at === undefined) return { kind: 'unavailable' }
      const written = admitted.items.set({
        scope: admitted.scope,
        item: { asset: access.asset, itemId: access.item },
        secret: parsed.value,
        at,
      })
      switch (written) {
        case 'written':
          return WRITTEN
        case 'not-written':
          return { kind: 'unavailable' }
        case 'unconfirmed':
          return { kind: 'unknown' }
        case 'denied':
          return { kind: 'denied' }
        default:
          return { kind: refusal(written) }
      }
    },

    async clear(access): Promise<SecretClearOutcome> {
      const admitted = await admit(access, 'clear', access.asset)
      if (admitted.kind !== 'scope') return admitted
      const removed = admitted.items.clear({
        scope: admitted.scope,
        item: { asset: access.asset, itemId: access.item },
      })
      switch (removed) {
        case 'removed':
          return WRITTEN
        case 'absent':
          return { kind: 'no-change' }
        case 'not-written':
          return { kind: 'unavailable' }
        case 'unconfirmed':
          return { kind: 'unknown' }
        case 'denied':
          return { kind: 'denied' }
        default:
          return { kind: refusal(removed) }
      }
    },
  }
  return Object.freeze(face)
}
