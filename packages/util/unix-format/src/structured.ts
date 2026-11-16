import { assertNonNegativeInteger } from './options.ts'
import { codePointLength, padEnd, sliceCodePoints } from './text.ts'

const ELLIPSIS = '...'
const COLUMN_GAP = '  '

export function formatTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  options: { readonly maxWidth?: number } = {},
): string {
  if (headers.length === 0) return ''
  const expected = headers.length
  rows.forEach((row, index) => {
    if (row.length !== expected) {
      throw new Error(`row ${index} has ${row.length} cells, expected ${expected}`)
    }
  })

  const maxWidth = options.maxWidth ?? 120
  assertNonNegativeInteger(maxWidth, 'maxWidth')
  const widths = headers.map(codePointLength)
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, codePointLength(cell))
    })
  }

  if (maxWidth > 0) {
    const total =
      widths.reduce((sum, width) => sum + width, 0) + COLUMN_GAP.length * (widths.length - 1)
    if (total > maxWidth) {
      const last = widths.length - 1
      widths[last] = Math.max(ELLIPSIS.length, (widths[last] ?? 0) - (total - maxWidth))
    }
  }

  const renderRow = (row: readonly string[]): string =>
    row
      .map((cell, index) => {
        const width = widths[index] ?? 0
        return codePointLength(cell) > width
          ? sliceCodePoints(cell, width - ELLIPSIS.length) + ELLIPSIS
          : padEnd(cell, width)
      })
      .join(COLUMN_GAP)

  const separator = widths.map(width => '-'.repeat(width)).join(COLUMN_GAP)
  return [renderRow(headers), separator, ...rows.map(renderRow)].join('\n')
}

export function formatKeyValue(
  pairs: Readonly<Record<string, string>> | Map<string, string>,
): string {
  const entries = pairs instanceof Map ? [...pairs.entries()] : Object.entries(pairs)
  if (entries.length === 0) return ''
  const keyWidth = Math.max(...entries.map(([key]) => codePointLength(key)))
  return entries.map(([key, value]) => `${padEnd(key, keyWidth)}: ${value}`).join('\n')
}

export function formatBulletList(items: readonly string[]): string {
  return items.map(item => `- ${item}`).join('\n')
}
