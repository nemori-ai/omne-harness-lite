import type { Change } from '@omne-harness/dynamis'

const GAP = '   '

/** Rows as aligned columns: a cell is padded to the widest cell of its column that is not the last of its row. */
export function columns(rows: readonly (readonly string[])[]): string[] {
  const widths: number[] = []
  for (const row of rows)
    row.slice(0, -1).forEach((cell, at) => {
      widths[at] = Math.max(widths[at] ?? 0, [...cell].length)
    })
  return rows.map(row =>
    row
      .map((cell, at) => (at === row.length - 1 ? cell : cell.padEnd(widths[at] ?? 0)))
      .join(GAP)
      .trimEnd(),
  )
}

type Branch<T> = Readonly<{ children: readonly T[] }>

const count = <T extends Branch<T>>(nodes: readonly T[]): number =>
  nodes.reduce((sum, node) => sum + 1 + count(node.children), 0)

/** The node with its children kept down to depth levels, and how many nodes were cut. A node cut here is rebuilt with how many it holds. */
export function cut<T extends Branch<T>>(
  node: T,
  depth: number | undefined,
  rebuild: (node: T, children: readonly T[], inside: number) => T,
): { node: T; hidden: number } {
  if (depth === undefined) return { node, hidden: 0 }
  if (depth === 0) {
    const inside = count(node.children)
    return { node: rebuild(node, [], inside), hidden: inside }
  }
  let hidden = 0
  const children = node.children.map(child => {
    const kept = cut(child, depth - 1, rebuild)
    hidden += kept.hidden
    return kept.node
  })
  return { node: rebuild(node, children, 0), hidden }
}

export const insideText = (inside: number): string => (inside === 0 ? '' : `   (${inside} inside)`)

export const moreLine = (hidden: number, under: string, depth: number): string =>
  `${hidden} more under ${under}; give depth ${depth + 1} or a narrower under.`

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, at) => at)
  for (let row = 1; row <= left.length; row += 1) {
    const next = [row]
    for (let at = 1; at <= right.length; at += 1)
      next[at] = Math.min(
        (previous[at] as number) + 1,
        (next[at - 1] as number) + 1,
        (previous[at - 1] as number) + (left[row - 1] === right[at - 1] ? 0 : 1),
      )
    previous = next
  }
  return previous[right.length] as number
}

/** The few names closest to the one asked for, nearest first. */
export function nearest(asked: string, names: Iterable<string>, few = 3): string[] {
  return [...new Set(names)]
    .map(name => ({ name, far: distance(asked.toLowerCase(), name.toLowerCase()) }))
    .sort((left, right) => left.far - right.far || (left.name < right.name ? -1 : 1))
    .slice(0, few)
    .map(({ name }) => name)
}

const HAN = /\p{Script=Han}+/gu

/** The words of a query: a run of Chinese characters gives its adjacent pairs, a lone one itself; other words stay as they are. */
export function terms(query: string): string[] {
  const words = new Set<string>()
  for (const word of query.toLowerCase().split(/\s+/u)) {
    for (const run of word.match(HAN) ?? [])
      if (run.length === 1) words.add(run)
      else for (let at = 0; at + 1 < run.length; at += 1) words.add(run.slice(at, at + 2))
    for (const rest of word.split(HAN)) if (/[\p{L}\p{N}]/u.test(rest)) words.add(rest)
  }
  return [...words]
}

export function score(query: string, text: string): number {
  const haystack = text.toLowerCase()
  return terms(query).filter(word => haystack.includes(word)).length
}

export const stateText = (state: Change['before'], detail = ''): string =>
  state === 'effective'
    ? 'in effect'
    : state === 'absent'
      ? 'absent'
      : `not in effect: ${state}${detail === '' ? '' : ` (${detail})`}`

export const placeOf = (...parts: readonly string[]): string =>
  parts.filter(part => part !== '').join(' / ')

export const scopeText = (scope: readonly string[], asker: readonly string[]): string =>
  scope.length === 0
    ? 'deployment'
    : scope.length === asker.length && scope.every((part, at) => part === asker[at])
      ? 'this tenant'
      : 'another scope'
