import type { Context } from '@deepseek-ai/cordis'
import type { RowId, ServiceName, Visibility } from './types.ts'

/** One trusted scope: the service names whose resolution label only trusted assembly code holds. */
export type TrustScopeSpec = Readonly<{ id: string; names: readonly ServiceName[] }>

export type RowVisibility = Readonly<{ names: readonly ServiceName[]; source: 'release-code' }>

export interface Trust {
  isTrusted(name: ServiceName): boolean
  /** Trusted names visible to a row. A row that is not in the table sees none. */
  visibleNames(row: RowId): readonly ServiceName[]
  /** Printable form of {@link visibleNames}; the source is always release code, never operator config. */
  describe(row: RowId): RowVisibility
  /** Context for a row: the root with one `isolate` per visible name, each under that name's label. */
  contextForRow(root: Context, row: RowId): Context
  /** Context that resolves one trusted name under its label, for the entry to provide or read it. */
  contextForName(root: Context, name: ServiceName): Context
}

/**
 * Build the scope table. The labels live only in this closure.
 *
 * Cordis keys its service store by the label symbol alone, so two names that
 * shared one label would collide at `provide`. Each trusted name therefore gets
 * its own label. A scope is the set of names that the table treats together.
 */
export function createTrust(scopes: readonly TrustScopeSpec[], visibility: Visibility): Trust {
  const labels = new Map<ServiceName, symbol>()
  for (const scope of scopes) {
    for (const name of scope.names) {
      if (labels.has(name)) throw new Error(`trusted name "${name}" belongs to more than one scope`)
      labels.set(name, Symbol(`${scope.id}:${name}`))
    }
  }
  for (const [row, names] of visibility) {
    for (const name of names) {
      if (!labels.has(name))
        throw new Error(`row "${row}" lists "${name}", which no trusted scope owns`)
    }
  }

  const visibleNames = (row: RowId): readonly ServiceName[] => visibility.get(row) ?? []

  const contextForName = (root: Context, name: ServiceName): Context => {
    const label = labels.get(name)
    if (label === undefined) throw new Error(`"${name}" is not a trusted name`)
    return root.isolate(name, label)
  }

  return {
    isTrusted: name => labels.has(name),
    visibleNames,
    describe: row => ({ names: visibleNames(row), source: 'release-code' }),
    contextForName,
    contextForRow: (root, row) => {
      let ctx = root
      for (const name of visibleNames(row)) ctx = contextForName(ctx, name)
      return ctx
    },
  }
}
