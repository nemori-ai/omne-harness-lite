/**
 * Line-numbered text blocks in the shape of `cat -n`.
 *
 * A numbered block is not a table with a number column. A line number is an
 * address the model navigates by: it greps to find one, then asks for the
 * region around it. So numbering follows the caller's absolute position rather
 * than restarting per block, and truncating an overlong line never splits it
 * into two.
 */

import { assertNonNegativeInteger } from './options.ts'
import { codePointLength, padStart, sliceCodePoints } from './text.ts'

const MINIMUM_GUTTER_WIDTH = 6
const TRUNCATION_MARKER = ' [truncated]'

export interface NumberedLinesOptions {
  /** Absolute number of the first line. A slice of a larger text passes its real offset. Defaults to 1. */
  readonly start?: number
  /** Mark between the gutter and the content. Defaults to `|`. */
  readonly separator?: string
  /**
   * Maximum code points of content per line. A longer line is cut and marked
   * ` [truncated]`, and still counts as one line.
   */
  readonly perLineCharLimit?: number
  /**
   * Cap on the whole rendered line: gutter, separator and content together,
   * with the same meaning as `UnixFormatOptions.maxWidth`. Defaults to `0`,
   * which caps nothing.
   */
  readonly maxWidth?: number
}

/** Render lines with a right-aligned number gutter; empty input renders nothing. */
export function formatNumberedLines(
  lines: readonly string[],
  options: NumberedLinesOptions = {},
): string {
  const start = options.start ?? 1
  const separator = options.separator ?? '|'
  const maxWidth = options.maxWidth ?? 0
  if (!Number.isInteger(start))
    throw new RangeError(`start must be an integer, got ${String(start)}`)
  if (options.perLineCharLimit !== undefined)
    assertNonNegativeInteger(options.perLineCharLimit, 'perLineCharLimit')
  assertNonNegativeInteger(maxWidth, 'maxWidth')
  if (lines.length === 0) return ''

  const width = Math.max(MINIMUM_GUTTER_WIDTH, String(start + lines.length - 1).length)
  return lines
    .map((line, offset) => {
      const content = applyContentLimit(line, options.perLineCharLimit)
      const rendered = `${padStart(String(start + offset), width)} ${separator} ${content}`
      return maxWidth > 0 && codePointLength(rendered) > maxWidth
        ? sliceCodePoints(rendered, maxWidth)
        : rendered
    })
    .join('\n')
}

/** Cut an overlong line and mark it; a line at the limit stays untouched. */
function applyContentLimit(line: string, limit: number | undefined): string {
  if (limit === undefined || codePointLength(line) <= limit) return line
  return `${sliceCodePoints(line, limit)}${TRUNCATION_MARKER}`
}
