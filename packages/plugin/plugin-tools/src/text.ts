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

/** The node with its children kept down to depth levels, and how many nodes were cut. */
export function cut<T extends Branch<T>>(
  node: T,
  depth: number | undefined,
  rebuild: (node: T, children: readonly T[]) => T,
): { node: T; hidden: number } {
  if (depth === undefined) return { node, hidden: 0 }
  if (depth === 0) return { node: rebuild(node, []), hidden: count(node.children) }
  let hidden = 0
  const children = node.children.map(child => {
    const kept = cut(child, depth - 1, rebuild)
    hidden += kept.hidden
    return kept.node
  })
  return { node: rebuild(node, children), hidden }
}

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

/** How many of the words of a query a text holds: case does not count, and text without spaces matches as a substring. */
export function score(query: string, text: string): number {
  const haystack = text.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/u)
    .filter(word => word !== '' && haystack.includes(word)).length
}

export const stateText = (state: Change['before'], detail = ''): string =>
  state === 'effective'
    ? 'in effect'
    : state === 'absent'
      ? 'absent'
      : `not in effect: ${state}${detail === '' ? '' : ` (${detail})`}`

export const placeOf = (...parts: readonly string[]): string =>
  parts.filter(part => part !== '').join(' / ')

export const scopeText = (scope: readonly string[]): string =>
  scope.length === 0 ? '' : `@${scope.join('/')}`
