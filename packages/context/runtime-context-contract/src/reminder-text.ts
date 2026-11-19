import type { BlockEntry, BlockState, ChangeEntry, ChangeMaterial } from './reader.js'

// The model reads these texts in its history; the same blocks give the same bytes, whatever order
// the reader returned them in.

function json(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(json).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${json((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function valueText(state: BlockState): string {
  return state.kind === 'value' ? json(state.value) : '(no value)'
}

const byKey = <T extends { key: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

/** The full reminder of the blocks the model may read; null when none of them has a value. */
export function renderSnapshotReminder(blocks: readonly BlockEntry[]): string | null {
  const shown = byKey(blocks.filter(block => block.state.kind === 'value'))
  if (shown.length === 0) return null
  return [
    'Runtime context: the current values. They hold from here until a later runtime context reminder changes them.',
    ...shown.flatMap(block => [
      `<block key="${block.key}" revision="${block.revision}">`,
      valueText(block.state),
      '</block>',
    ]),
  ].join('\n')
}

/** The reminder of the blocks that changed; null when nothing the model reads changed. */
export function renderChangeReminder(
  entries: readonly ChangeEntry[],
  materials: readonly ChangeMaterial[],
): string | null {
  if (materials.length === 0) return null
  const current = new Map(entries.map(entry => [entry.key, entry.state]))
  return [
    'Runtime context: these values changed. The new values hold from here.',
    ...byKey(materials).flatMap(material => {
      const state = current.get(material.key)
      return [
        `<block key="${material.key}" from="${material.from ?? 'none'}" to="${material.to}">`,
        state === undefined ? '(no value)' : valueText(state),
        ...(material.previous.kind === 'value'
          ? [`<previous>${json(material.previous.value)}</previous>`]
          : []),
        '</block>',
      ]
    }),
  ].join('\n')
}
