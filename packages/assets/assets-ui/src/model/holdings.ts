import type { Row } from './settings-machine.ts'

export type Holding = Readonly<{ category: string; name: string; rows: readonly Row[] }>

export function holdingsOf(rows: readonly Row[]): readonly Holding[] {
  const holdings: { category: string; name: string; rows: Row[] }[] = []
  for (const row of rows) {
    const owner = row.view.owner
    if (owner.kind !== 'asset') continue
    const { category, name } = owner
    const held = holdings.find(holding => holding.category === category && holding.name === name)
    if (held === undefined) holdings.push({ category, name, rows: [row] })
    else held.rows.push(row)
  }
  return holdings
}
