import type { Row } from './settings-machine.ts'

export type SettingGroup = Readonly<{
  key: string
  title: string
  description: string
  rows: readonly Row[]
}>

export function groupsOf(rows: readonly Row[]): readonly SettingGroup[] {
  const groups: { key: string; title: string; description: string; rows: Row[] }[] = []
  for (const row of rows) {
    const owner = row.view.owner
    if (owner.kind !== 'independent') continue
    const { id, title, description } = row.view.declaration.group
    const key = JSON.stringify([owner.providerId, owner.definitionId, id])
    const known = groups.find(group => group.key === key)
    if (known === undefined) groups.push({ key, title, description, rows: [row] })
    else known.rows.push(row)
  }
  return groups
}
