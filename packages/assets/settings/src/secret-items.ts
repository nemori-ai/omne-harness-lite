// The secret-item entry (SPEC「秘密设置项」): the one place that turns a declared secret item into a
// secret binding key. It checks that the item is declared, and declared secret, in the registered
// definition of the holding the caller resolves; derives the target from that holding and the item;
// and hands the write, the removal and the read to the custody. It keeps no value and no presence:
// every answer about presence is the custody's answer now. It does not touch the commit port of
// ordinary values, so no secret reaches a settings record (I-13). The scope is the caller's; the
// entry passes it to the custody unchanged, and the custody keeps tenants apart (I-2).
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

/** The asset reference a caller resolves: the category may be left out when the name is enough. */
export type SettingsAssetQuery = Readonly<{ category?: string; name: string }>

/** The asset an item belongs to, as the caller names it, and the item id inside its definition. */
export type SecretItemRef = Readonly<{ asset: SettingsAssetQuery; itemId: string }>

/** A concrete holding: which definition of which definition provider the caller's asset is. */
export type SettingsHolding = Readonly<{ providerId: string; definitionId: string }>

/** One resolved holding, with the asset it stands for. */
export type SettingsHoldingRef = Readonly<{
  asset: Readonly<{ category: string; name: string }>
  holding: SettingsHolding
}>

/** What a list shows of one item: the presence is read for a secret item only, and has no value. */
export type SecretItemView = Readonly<{
  asset: Readonly<{ category: string; name: string }>
  itemId: string
  title: string
  sensitivity: SettingItem['sensitivity']
  presence?: SecretPresence
}>

/** The answers of the entry that come before the custody is asked. */
export type SecretItemRefusal = 'not-secret' | 'undeclared' | 'conflict'

export interface SettingsSecretItems {
  /** Binds the secret to the declared secret item. The secret goes to the custody and nowhere else. */
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
  /** The presence of the binding, read from the custody now. */
  describe(
    input: Readonly<{ scope: SecretScope; item: SecretItemRef }>,
  ): SecretPresence | 'denied' | 'unavailable' | SecretItemRefusal
  /** Every item of the resolved holdings; without `asset`, of every holding the caller resolves. */
  items(
    input: Readonly<{ scope: SecretScope; asset?: SettingsAssetQuery }>,
  ): readonly SecretItemView[] | 'denied' | 'unavailable' | 'conflict'
}

export type SettingsSecretItemsDeps = Readonly<{
  /** The registered definitions, read at each call. */
  declarations: Readonly<{ snapshot(): SettingsRegistrySnapshot }>
  custody: SecretCustodyManagement
  /**
   * The asset references to their holdings: the assembly knows which registered definition each
   * asset it holds is. Without a query, every holding it knows. The entry never guesses a holding.
   */
  resolve(asset?: SettingsAssetQuery): readonly SettingsHoldingRef[]
}>

/** The one purpose of every asset secret setting item. */
export const SETTING_SECRET_PURPOSE = 'setting'

/** The owner of every asset secret setting target. */
const TARGET_OWNER = 'setting'

/**
 * The target of a secret item: the holding and the item id, encoded as one JSON array of three
 * strings. JSON escapes the quotes and backslashes inside a string, so the encoding is injective;
 * a value that contains the separators cannot collide with another triple.
 */
function targetOf(holding: SettingsHolding, itemId: string): SecretTarget {
  return {
    owner: TARGET_OWNER,
    key: JSON.stringify([holding.providerId, holding.definitionId, itemId]),
  }
}

function keyOf(scope: SecretScope, holding: SettingsHolding, itemId: string): SecretBindingKey {
  return { scope, target: targetOf(holding, itemId), purpose: SETTING_SECRET_PURPOSE }
}

type Located =
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'undeclared' }>
  | Readonly<{ kind: 'declared'; ref: SettingsHoldingRef; definition: SettingDefinitions }>

export function createSettingsSecretItems(deps: SettingsSecretItemsDeps): SettingsSecretItems {
  const { declarations, custody, resolve } = deps

  /** The live definitions of one holding; several live versions of one holding are a conflict. */
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

  /** The one holding of an asset reference and its registered definition. */
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
      const view = {
        asset: ref.asset,
        itemId: item.id,
        title: item.presentation.title,
        sensitivity: item.sensitivity,
      }
      if (item.sensitivity !== 'secret') {
        views.push(view)
        continue
      }
      const presence = custody.describe(keyOf(scope, ref.holding, item.id))
      if (presence === 'denied' || presence === 'unavailable') return presence
      views.push({ ...view, presence })
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
