import {
  eventTypeNameSchema,
  sourceNameSchema,
  type SourceDeclaration,
  type SourceLookup,
  type SourceName,
} from '@omne-harness/notification-contract'

export class NotificationRegistrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotificationRegistrationError'
  }
}

/** The extension point `notification.sources`. Registering is the effect; the result undoes it. */
export interface NotificationSources {
  register(declaration: SourceDeclaration): () => void
  lookup(name: SourceName): SourceLookup
  /** Every source registered right now. A source that cannot be read answers `unreadable`. */
  list(): readonly SourceLookup[]
}

function checkDeclaration(declaration: SourceDeclaration): void {
  if (!sourceNameSchema.safeParse(declaration.name).success)
    throw new NotificationRegistrationError(`invalid source name: ${String(declaration.name)}`)
  const names = new Set<string>()
  for (const type of declaration.types) {
    if (!eventTypeNameSchema.safeParse(type.name).success || names.has(type.name))
      throw new NotificationRegistrationError(
        `invalid or repeated event type in ${declaration.name}: ${String(type.name)}`,
      )
    names.add(type.name)
  }
}

export function createSourceRegistry(onChange: () => void = () => {}): NotificationSources {
  const entries = new Map<SourceName, SourceDeclaration>()
  return {
    register(declaration) {
      checkDeclaration(declaration)
      if (entries.has(declaration.name))
        throw new NotificationRegistrationError(`source already registered: ${declaration.name}`)
      entries.set(declaration.name, declaration)
      onChange()
      return () => {
        if (entries.get(declaration.name) !== declaration) return
        entries.delete(declaration.name)
        onChange()
      }
    },
    lookup(name) {
      const declaration = entries.get(name)
      return declaration === undefined ? { kind: 'absent' } : { kind: 'registered', declaration }
    },
    list() {
      return [...entries.values()].map(declaration => ({ kind: 'registered', declaration }))
    },
  }
}
