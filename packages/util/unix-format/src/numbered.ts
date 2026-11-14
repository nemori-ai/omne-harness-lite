import { assertNonNegativeInteger } from './options.ts'
import { codePointLength, padStart, sliceCodePoints } from './text.ts'

const MINIMUM_GUTTER_WIDTH = 6
const TRUNCATION_MARKER = ' [truncated]'

export interface NumberedLinesOptions {
  readonly start?: number
  readonly separator?: string
  readonly perLineCharLimit?: number
  readonly maxWidth?: number
}

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

function applyContentLimit(line: string, limit: number | undefined): string {
  if (limit === undefined || codePointLength(line) <= limit) return line
  return `${sliceCodePoints(line, limit)}${TRUNCATION_MARKER}`
}
