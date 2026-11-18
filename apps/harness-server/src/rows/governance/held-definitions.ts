import { capabilityId, MAX_ASSET_PAGE, type CategoryView } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { SettingDefinitions, createSettingsRegistry } from '@omne-harness/settings'

type Registry = Pick<ReturnType<typeof createSettingsRegistry>, 'registerContribution'>

// One registry serves every tenant, and each registration takes a place in it: a definition is registered once.
const registeredOf = new WeakMap<Registry, Set<string>>()

const keyOf = (definition: SettingDefinitions) =>
  JSON.stringify([definition.providerId, definition.definitionId, definition.version])

async function heldOf(assets: AssetsLocal, category: string): Promise<string[] | undefined> {
  const names: string[] = []
  let after: string | null = null
  do {
    const page = await assets.listHeld({ category, after, limit: MAX_ASSET_PAGE })
    if (page.kind !== 'page') return undefined
    names.push(...page.items.map(item => item.name))
    after = page.next
  } while (after !== null)
  return names
}

/**
 * The settings definitions of the versions a tenant holds, made known to the settings registry
 * before its settings are read: a version a tenant publishes declares its settings in its body,
 * and the catalog reads a target only when the registry knows its definition. Rescans after a
 * change of the assets of the tenant, not on every read.
 */
export function heldDefinitionsOf(
  input: Readonly<{ registry: Registry; categories: Pick<CategoryView, 'list' | 'lookup'> }>,
) {
  let registered = registeredOf.get(input.registry)
  if (registered === undefined) {
    registered = new Set()
    registeredOf.set(input.registry, registered)
  }
  const known = registered
  // Per local assets: the scan in flight, and whether a change came after the last scan began.
  const states = new WeakMap<AssetsLocal, { scan: Promise<boolean> | null; dirty: boolean }>()

  async function scan(assets: AssetsLocal): Promise<boolean> {
    const categories = input.categories
      .list()
      .map(listing => listing.category)
      .filter(category => input.categories.lookup(category)?.settings !== undefined)
    for (const category of categories) {
      const names = await heldOf(assets, category)
      if (names === undefined) return false
      for (const name of names) {
        const capability = capabilityId(category, name)
        if (!capability.ok) continue
        const held = await assets.readHeldCapability({ capability: capability.id })
        if (held.kind === 'rejected') return false
        const definition = held.kind === 'holding' ? held.selected?.definition : null
        if (definition === null || definition === undefined || known.has(keyOf(definition)))
          continue
        if (input.registry.registerContribution(definition).kind === 'registered')
          known.add(keyOf(definition))
      }
    }
    return true
  }

  return {
    async ensure(assets: AssetsLocal | undefined): Promise<void> {
      if (assets === undefined) return
      let state = states.get(assets)
      if (state === undefined) {
        const created = { scan: null as Promise<boolean> | null, dirty: true }
        assets.changes.subscribe(() => {
          created.dirty = true
        })
        states.set(assets, created)
        state = created
      }
      while (state.dirty || state.scan !== null) {
        if (state.scan === null) {
          state.dirty = false
          const current = state
          current.scan = scan(assets)
            .catch(() => false)
            .then(done => {
              current.scan = null
              if (!done) current.dirty = true
              return done
            })
        }
        if (!(await state.scan)) return
      }
    },
  }
}
