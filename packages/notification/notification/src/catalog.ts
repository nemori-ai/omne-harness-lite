import type {
  CallContext,
  CatalogEventType,
  CatalogSource,
  EventTypeDeclaration,
  NotificationCatalog,
  SourceDeclaration,
} from '@omne-harness/notification-contract'
import { ask, type NotificationAuthority } from './ports.ts'
import type { NotificationChannels, NotificationSources } from './registries.ts'

export type CatalogDependencies = Readonly<{
  authority: NotificationAuthority
  sources: NotificationSources
  channels: NotificationChannels
}>

const UNAVAILABLE = { kind: 'basis-unavailable' } as const
const DENIED = { kind: 'refused', reason: 'not-permitted' } as const

function typeOf(declared: EventTypeDeclaration): CatalogEventType {
  const { name, label, description, subscribable, nameable, defaults, external } = declared
  const { presence, hint } = declared.subject
  const kind = declared.kind.kind
  return {
    name,
    label,
    description,
    kind,
    subject: { presence, hint },
    subscribable,
    nameable,
    defaults,
    external,
  }
}

const sourceOf = ({ name, label, types }: SourceDeclaration): CatalogSource => ({
  name,
  label,
  types: types.map(typeOf),
})

export function createCatalog(deps: CatalogDependencies): NotificationCatalog {
  async function gate(ctx: CallContext): Promise<typeof UNAVAILABLE | typeof DENIED | null> {
    const answer = await ask(deps.authority, ctx, { kind: 'list-catalog' })
    if (answer === 'denied') return DENIED
    return answer === 'unavailable' ? UNAVAILABLE : null
  }

  /** The declarations registered now. Null: one of them cannot be read, so the list would be short. */
  function declarations(): readonly SourceDeclaration[] | null {
    const read: SourceDeclaration[] = []
    try {
      for (const entry of deps.sources.list()) {
        if (entry.kind !== 'registered') return null
        read.push(entry.declaration)
      }
    } catch {
      return null
    }
    return read
  }

  return {
    async sources(ctx) {
      const blocked = await gate(ctx)
      if (blocked !== null) return blocked
      const all = declarations()
      if (all === null) return UNAVAILABLE
      const known: CatalogSource[] = []
      for (const declaration of all) {
        const answer = await ask(deps.authority, ctx, {
          kind: 'know-source',
          source: declaration.name,
        })
        if (answer === 'unavailable') return UNAVAILABLE
        if (answer === 'allowed') known.push(sourceOf(declaration))
      }
      return { kind: 'done', recalled: false, value: known }
    },

    async channels(ctx) {
      const blocked = await gate(ctx)
      if (blocked !== null) return blocked
      const value = deps.channels.list().map(({ name, label, leavesSystem, address }) => ({
        name,
        label,
        leavesSystem,
        addressHint: address.hint,
      }))
      return { kind: 'done', recalled: false, value }
    },
  }
}
