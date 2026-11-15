import type { Instant } from '@omne-harness/utc-instant'
import type { SettingsRegistrySnapshot } from './registry.ts'
import type { SettingDefinitions, SettingItem } from './schema.ts'
import type {
  SecretBindingKey,
  SecretCustodyManagement,
  SecretPresence,
  SecretRemoveResult,
  SecretScope,
  SecretTarget,
  SecretText,
  SecretWriteResult,
} from './secrets.ts'

export type SettingsAssetQuery = Readonly<{ category?: string; name: string }>

export type SecretItemRef = Readonly<{ asset: SettingsAssetQuery; itemId: string }>

export type SettingsHolding = Readonly<{ providerId: string; definitionId: string }>

export type SettingsHoldingRef = Readonly<{
  asset: Readonly<{ category: string; name: string }>
  holding: SettingsHolding
}>

export type SecretItemView = Readonly<{
  asset: Readonly<{ category: string; name: string }>
  itemId: string
  title: string
}> &
  (
    | Readonly<{ sensitivity: 'secret'; presence: SecretPresence }>
    | Readonly<{ sensitivity: Exclude<SettingItem['sensitivity'], 'secret'> }>
  )

export type SecretItemRefusal = 'not-secret' | 'undeclared' | 'conflict'

export interface SettingsSecretItems {
  set(
    input: Readonly<{
      scope: SecretScope
      item: SecretItemRef
      secret: SecretText
      at: Instant | null
    }>,
  ): SecretWriteResult | SecretItemRefusal
  clear(
    input: Readonly<{ scope: SecretScope; item: SecretItemRef }>,
  ): SecretRemoveResult | SecretItemRefusal
  describe(
    input: Readonly<{ scope: SecretScope; item: SecretItemRef }>,
  ): SecretPresence | 'denied' | 'unavailable' | SecretItemRefusal
  items(
    input: Readonly<{ scope: SecretScope; asset?: SettingsAssetQuery }>,
  ): readonly SecretItemView[] | 'denied' | 'unavailable' | 'conflict'
}

export type SettingsSecretItemsDeps = Readonly<{
  declarations: Readonly<{ snapshot(): SettingsRegistrySnapshot }>
  custody: SecretCustodyManagement
  resolve(asset?: SettingsAssetQuery): readonly SettingsHoldingRef[]
}>

export const SETTING_SECRET_PURPOSE = 'setting'

const TARGET_OWNER = 'setting'

export function secretItemTarget(holding: SettingsHolding, itemId: string): SecretTarget {
  return {
    owner: TARGET_OWNER,
    key: JSON.stringify([holding.providerId, holding.definitionId, itemId]),
  }
}

function keyOf(scope: SecretScope, holding: SettingsHolding, itemId: string): SecretBindingKey {
  return { scope, target: secretItemTarget(holding, itemId), purpose: SETTING_SECRET_PURPOSE }
}

type Located =
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'undeclared' }>
  | Readonly<{ kind: 'declared'; ref: SettingsHoldingRef; definition: SettingDefinitions }>

export function createSettingsSecretItems(deps: SettingsSecretItemsDeps): SettingsSecretItems {
  const { declarations, custody, resolve } = deps

  function definitionsOf(holding: SettingsHolding): readonly SettingDefinitions[] {
    return declarations
      .snapshot()
      .definitions.filter(
        definition =>
          definition.providerId === holding.providerId &&
          definition.definitionId === holding.definitionId,
      )
  }

  function locateHolding(ref: SettingsHoldingRef): Located {
    const definitions = definitionsOf(ref.holding)
    if (definitions.length > 1) return { kind: 'conflict' }
    const definition = definitions[0]
    return definition === undefined ? { kind: 'undeclared' } : { kind: 'declared', ref, definition }
  }

  function locateAsset(asset: SettingsAssetQuery): Located {
    const refs = resolve(asset)
    if (refs.length > 1) return { kind: 'conflict' }
    const ref = refs[0]
    return ref === undefined ? { kind: 'undeclared' } : locateHolding(ref)
  }

  type Item =
    | Readonly<{ kind: 'secret'; key: SecretBindingKey }>
    | Readonly<{ kind: SecretItemRefusal }>

  function locateItem(scope: SecretScope, item: SecretItemRef): Item {
    const located = locateAsset(item.asset)
    if (located.kind !== 'declared') return located
    const declared = located.definition.items.find(candidate => candidate.id === item.itemId)
    if (declared === undefined) return { kind: 'undeclared' }
    if (declared.sensitivity !== 'secret') return { kind: 'not-secret' }
    return { kind: 'secret', key: keyOf(scope, located.ref.holding, item.itemId) }
  }

  function viewsOf(
    scope: SecretScope,
    ref: SettingsHoldingRef,
    definition: SettingDefinitions,
  ): readonly SecretItemView[] | 'denied' | 'unavailable' {
    const views: SecretItemView[] = []
    for (const item of definition.items) {
      const view = { asset: ref.asset, itemId: item.id, title: item.presentation.title }
      if (item.sensitivity !== 'secret') {
        views.push({ ...view, sensitivity: item.sensitivity })
        continue
      }
      const presence = custody.describe(keyOf(scope, ref.holding, item.id))
      if (presence === 'denied' || presence === 'unavailable') return presence
      views.push({ ...view, sensitivity: item.sensitivity, presence })
    }
    return views
  }

  return Object.freeze({
    set({ scope, item, secret, at }) {
      const located = locateItem(scope, item)
      return located.kind === 'secret' ? custody.bind(located.key, secret, at) : located.kind
    },
    clear({ scope, item }) {
      const located = locateItem(scope, item)
      return located.kind === 'secret' ? custody.unbind(located.key) : located.kind
    },
    describe({ scope, item }) {
      const located = locateItem(scope, item)
      return located.kind === 'secret' ? custody.describe(located.key) : located.kind
    },
    items({ scope, asset }) {
      const refs = resolve(asset)
      if (asset !== undefined && refs.length > 1) return 'conflict'
      const views: SecretItemView[] = []
      for (const ref of refs) {
        const located = locateHolding(ref)
        if (located.kind === 'conflict') return 'conflict'
        if (located.kind === 'undeclared') continue
        const listed = viewsOf(scope, ref, located.definition)
        if (typeof listed === 'string') return listed
        views.push(...listed)
      }
      return views
    },
  } satisfies SettingsSecretItems)
}
