import type { Context } from '@deepseek-ai/cordis'
import type { RowId, ServiceName, Visibility } from './types.ts'

export type TrustScopeSpec = Readonly<{ id: string; names: readonly ServiceName[] }>

export type RowVisibility = Readonly<{ names: readonly ServiceName[]; source: 'release-code' }>

export interface Trust {
  isTrusted(name: ServiceName): boolean
  visibleNames(row: RowId): readonly ServiceName[]
  describe(row: RowId): RowVisibility
  contextForRow(root: Context, row: RowId): Context
  contextForName(root: Context, name: ServiceName): Context
}

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
