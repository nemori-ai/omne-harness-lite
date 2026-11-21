import { byScope, byText, type Instance, type Placed, type Scope } from './registry.ts'

export type Filtered<I = unknown> = Readonly<{
  entry: Placed<I>
  reason: 'overridden' | 'breach'
  detail: string
}>

export type Item<I = unknown> = Readonly<{ entry: Placed<I>; holders: readonly Instance[] }>

export type Unavailable = Readonly<{
  kind: 'unavailable'
  reason: 'undeclared' | 'ambiguous' | 'unread'
  detail: string
}>

export type Answer<I = unknown> =
  | Readonly<{ kind: 'none'; filtered: readonly Filtered<I>[] }>
  | Readonly<{
      kind: 'one'
      entry: Placed<I>
      holders: readonly Instance[]
      filtered: readonly Filtered<I>[]
    }>
  | Readonly<{ kind: 'conflict'; entries: readonly Placed<I>[]; filtered: readonly Filtered<I>[] }>
  | Unavailable

export type Listing<I = unknown> =
  | Readonly<{
      kind: 'read'
      items: readonly Item<I>[]
      conflicts: readonly (readonly Placed<I>[])[]
      filtered: readonly Filtered<I>[]
    }>
  | Unavailable

/** An entry is seen by an asker whose scope starts with the scope of the entry. */
export function visible(scope: Scope, asker: Scope): boolean {
  return scope.every((part, index) => part === asker[index])
}

/** Entries with one key, id, scope and digest are one item; the first in registry order stands for it. */
export function distinct<I>(entries: readonly Placed<I>[]): readonly Item<I>[] {
  const items = new Map<string, { entry: Placed<I>; holders: Instance[] }>()
  for (const entry of entries) {
    const mark = JSON.stringify([entry.key, entry.id, entry.scope, entry.digest])
    const held = items.get(mark)
    if (held === undefined) items.set(mark, { entry, holders: [entry.instance] })
    else held.holders.push(entry.instance)
  }
  return [...items.values()]
}

function settle<I>(items: readonly Item<I>[], filtered: readonly Filtered<I>[]): Answer<I> {
  const [first, ...rest] = items
  if (first === undefined) return { kind: 'none', filtered }
  if (rest.length === 0)
    return { kind: 'one', entry: first.entry, holders: first.holders, filtered }
  return { kind: 'conflict', entries: items.map(item => item.entry), filtered }
}

export function exactlyOne<I>(
  entries: readonly Placed<I>[],
  filtered: readonly Filtered<I>[] = [],
): Answer<I> {
  return settle(distinct(entries), filtered)
}

/** The items at the deepest scope stand; the shallower ones are out, each naming the scope over it. */
function deepest<I>(
  first: Item<I>,
  rest: readonly Item<I>[],
): { top: [Item<I>, ...Item<I>[]]; out: Filtered<I>[] } {
  const items = [first, ...rest]
  const depth = Math.max(...items.map(item => item.entry.scope.length))
  const [lead, ...others] = items.filter(item => item.entry.scope.length === depth) as [
    Item<I>,
    ...Item<I>[],
  ]
  const over = lead.entry.scope.join('/')
  const out = items
    .filter(item => item.entry.scope.length < depth)
    .map(item => ({ entry: item.entry, reason: 'overridden' as const, detail: over }))
  return { top: [lead, ...others], out }
}

export function mostSpecific<I>(
  entries: readonly Placed<I>[],
  filtered: readonly Filtered<I>[] = [],
): Answer<I> {
  const [first, ...rest] = distinct(entries)
  if (first === undefined) return { kind: 'none', filtered }
  const { top, out } = deepest(first, rest)
  return settle(top, [...filtered, ...out])
}

const byListed = <I>(left: Item<I>, right: Item<I>): number =>
  left.entry.rank - right.entry.rank ||
  byText(left.entry.id, right.entry.id) ||
  byText(left.entry.key, right.entry.key) ||
  byScope(left.entry.scope, right.entry.scope)

export function listed<I>(
  entries: readonly Placed<I>[],
  filtered: readonly Filtered<I>[] = [],
): Listing<I> {
  const groups = new Map<string, Item<I>[]>()
  for (const item of distinct(entries)) {
    const mark = JSON.stringify([item.entry.key, item.entry.id])
    groups.set(mark, [...(groups.get(mark) ?? []), item])
  }
  const items: Item<I>[] = []
  const conflicts: (readonly Placed<I>[])[] = []
  const gone: Filtered<I>[] = [...filtered]
  for (const [first, ...rest] of groups.values() as Iterable<[Item<I>, ...Item<I>[]]>) {
    const { top, out } = deepest(first, rest)
    gone.push(...out)
    if (top.length === 1) items.push(top[0])
    else conflicts.push(top.map(item => item.entry))
  }
  return { kind: 'read', items: items.sort(byListed), conflicts, filtered: gone }
}
