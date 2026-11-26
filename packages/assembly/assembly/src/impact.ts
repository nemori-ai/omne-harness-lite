export type SwapWay = 'implementation' | 'rerun' | 'restart'

export type RowSpec = Readonly<{
  name: string
  layer: 'official'
  provides: readonly string[]
  injects: readonly string[]
  swap: SwapWay
  contracts: Readonly<Record<string, string>>
}>

export type Change =
  | Readonly<{ kind: 'replace'; row: string; next: RowSpec }>
  | Readonly<{ kind: 'lost'; row: string }>
  | Readonly<{ kind: 'returned'; row: string }>

export type Impact = Readonly<{
  kind: 'impact'
  way: SwapWay
  /** The rows that run again, a provider before the rows that inject from it. */
  reruns: readonly string[]
  reasons: readonly string[]
}>

export type Refused = Readonly<{
  kind: 'refused'
  reason: 'cycle' | 'unknown-row' | 'name-mismatch' | 'duplicate-row' | 'duplicate-provider'
  detail: readonly string[]
}>

/** A row that says nothing of its swap is swapped by a restart of the process. */
export function declareRow(
  row: Pick<RowSpec, 'name'> & Partial<Omit<RowSpec, 'name' | 'layer'>>,
): RowSpec {
  return {
    name: row.name,
    layer: 'official',
    provides: row.provides ?? [],
    injects: row.injects ?? [],
    swap: row.swap ?? 'restart',
    contracts: row.contracts ?? {},
  }
}

const refused = (reason: Refused['reason'], detail: readonly string[]): Refused => ({
  kind: 'refused',
  reason,
  detail,
})

const WEAKNESS: Readonly<Record<SwapWay, number>> = { implementation: 0, rerun: 1, restart: 2 }
const weaker = (one: SwapWay, other: SwapWay): SwapWay =>
  WEAKNESS[one] >= WEAKNESS[other] ? one : other

function dependents(graph: readonly RowSpec[], names: ReadonlySet<string>): RowSpec[] {
  const keys = new Set(graph.filter(row => names.has(row.name)).flatMap(row => row.provides))
  return graph.filter(row => row.injects.some(key => keys.has(key)))
}

function misdeclared(graph: readonly RowSpec[]): Refused | undefined {
  const names = new Set<string>()
  const providers = new Map<string, string>()
  for (const row of graph) {
    if (names.has(row.name)) return refused('duplicate-row', [row.name])
    names.add(row.name)
    for (const key of row.provides) {
      const first = providers.get(key)
      if (first !== undefined) return refused('duplicate-provider', [key, first, row.name])
      providers.set(key, row.name)
    }
  }
  return undefined
}

function cycle(graph: readonly RowSpec[]): readonly string[] | undefined {
  const done = new Set<string>()
  const walk = (row: RowSpec, path: readonly string[]): readonly string[] | undefined => {
    const at = path.indexOf(row.name)
    if (at >= 0) return path.slice(at)
    if (done.has(row.name)) return undefined
    for (const next of dependents(graph, new Set([row.name]))) {
      const found = walk(next, [...path, row.name])
      if (found !== undefined) return found
    }
    done.add(row.name)
    return undefined
  }
  for (const row of graph) {
    const found = walk(row, [])
    if (found !== undefined) return found
  }
  return undefined
}

function closure(graph: readonly RowSpec[], seed: ReadonlySet<string>): Set<string> {
  const down = new Set(seed)
  for (let grew = true; grew;) {
    grew = false
    for (const row of dependents(graph, down))
      if (!down.has(row.name)) {
        down.add(row.name)
        grew = true
      }
  }
  return down
}

/** `names` with a provider before its dependents; among rows that may come next, the order of the graph. */
function ordered(graph: readonly RowSpec[], names: ReadonlySet<string>): string[] {
  const left = graph.filter(row => names.has(row.name))
  const out: string[] = []
  while (left.length > 0) {
    const waiting = new Set(left.map(row => row.name))
    const at = left.findIndex(
      row => !left.some(other => other !== row && feeds(other, row, waiting)),
    )
    out.push(...left.splice(at < 0 ? 0 : at, 1).map(row => row.name))
  }
  return out
}
const feeds = (provider: RowSpec, row: RowSpec, waiting: ReadonlySet<string>): boolean =>
  waiting.has(provider.name) && provider.provides.some(key => row.injects.includes(key))

function reshaped(was: RowSpec, next: RowSpec): string[] {
  const keys = [...new Set([...was.provides, ...next.provides])].sort()
  return keys.filter(
    key =>
      was.provides.includes(key) !== next.provides.includes(key) ||
      was.contracts[key] !== next.contracts[key],
  )
}

const sameSet = (one: readonly string[], other: readonly string[]): boolean =>
  one.length === other.length && one.every(each => other.includes(each))

function settle(
  graph: readonly RowSpec[],
  seed: readonly string[],
  spared: string | undefined,
  why: readonly string[],
  judged: readonly RowSpec[] = [],
): Impact {
  const down = closure(graph, new Set(seed))
  if (spared !== undefined) down.delete(spared)
  const reruns = ordered(graph, down)
  const swapOf = (name: string): SwapWay => (graph.find(row => row.name === name) as RowSpec).swap
  const restartOnly = [
    ...judged.filter(row => row.swap === 'restart').map(row => row.name),
    ...reruns.filter(name => !judged.some(row => row.name === name) && swapOf(name) === 'restart'),
  ]
  return {
    kind: 'impact',
    way: restartOnly.length > 0 ? 'restart' : 'rerun',
    reruns,
    reasons: [...why, ...restartOnly.map(name => `restart-only:${name}`)],
  }
}

/** What a change does before it is done. The rule is Cordis's: a fiber whose provider is replaced runs again. */
export function planChange(graph: readonly RowSpec[], change: Change): Impact | Refused {
  const wrong = misdeclared(graph)
  if (wrong !== undefined) return wrong
  const was = graph.find(row => row.name === change.row)
  if (was === undefined) return refused('unknown-row', [change.row])
  if (change.kind !== 'replace') {
    const looped = cycle(graph)
    if (looped !== undefined) return refused('cycle', looped)
    return change.kind === 'lost'
      ? settle(graph, [was.name], was.name, [`row-lost:${was.name}`], [was])
      : settle(graph, [was.name], undefined, [`row-returned:${was.name}`])
  }
  const { next } = change
  if (next.name !== was.name) return refused('name-mismatch', [was.name, next.name])
  const after = graph.map(row => (row === was ? next : row))
  const wrongAfter = misdeclared(after)
  if (wrongAfter !== undefined) return wrongAfter
  const looped = cycle(graph) ?? cycle(after)
  if (looped !== undefined) return refused('cycle', looped)
  const changed = reshaped(was, next)
  const rewired = !sameSet(was.injects, next.injects)
  const least = weaker(was.swap, next.swap)
  if (changed.length === 0 && !rewired && least === 'implementation')
    return { kind: 'impact', way: 'implementation', reruns: [], reasons: [] }
  const why = [
    ...changed.map(key => `contract-changed:${key}`),
    ...(rewired ? [`injects-changed:${was.name}`] : []),
    ...(changed.length === 0 && !rewired ? [`row-reruns:${was.name}`] : []),
  ]
  // Who waits for a key the old one provided and who waits for a key only the new one provides both run again.
  const both: RowSpec = { ...next, provides: [...new Set([...was.provides, ...next.provides])] }
  const wide = after.map(row => (row === next ? both : row))
  return settle(wide, [was.name], undefined, why, [{ ...next, swap: least }])
}
