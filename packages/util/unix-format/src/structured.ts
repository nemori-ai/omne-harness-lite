/**
 * Structured-data renderers: fixed-width tables, colon-aligned key-value
 * listings and dash bullet lists. Renderers add no ANSI colour or box borders;
 * caller text and Unicode remain unchanged.
 */

import { assertNonNegativeInteger } from './options.ts'
import { codePointLength, padEnd, sliceCodePoints } from './text.ts'

const ELLIPSIS = '...'
const COLUMN_GAP = '  '

/**
 * Render a table whose columns are sized to their widest header or cell.
 *
 * When the total width exceeds `maxWidth`, the last column is shrunk (never
 * below the three characters of `...`) and overflowing cells are cut with a
 * trailing ellipsis. If even that cannot fit, the table exceeds the cap; the
 * bound is best-effort. Every row must have exactly as many cells as there are
 * headers. Empty headers render nothing.
 */
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

/**
 * Render `key: value` lines with keys padded so every colon aligns.
 *
 * Values are emitted as-is: a value containing newlines is not re-indented and
 * may read as extra entries. Records iterate in JavaScript property order, so
 * integer-like keys come first; pass a Map to keep insertion order exactly.
 */
export function formatKeyValue(
  pairs: Readonly<Record<string, string>> | Map<string, string>,
): string {
  const entries = pairs instanceof Map ? [...pairs.entries()] : Object.entries(pairs)
  if (entries.length === 0) return ''
  const keyWidth = Math.max(...entries.map(([key]) => codePointLength(key)))
  return entries.map(([key, value]) => `${padEnd(key, keyWidth)}: ${value}`).join('\n')
}

/** Render one `- item` line per entry; items are emitted as-is, newlines included. */
export function formatBulletList(items: readonly string[]): string {
  return items.map(item => `- ${item}`).join('\n')
}
