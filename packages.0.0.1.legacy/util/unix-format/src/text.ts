/**
 * Text measurement and padding by Unicode code point.
 *
 * Alignment is computed by code-point count, matching the Python source: East
 * Asian wide characters and emoji may visually misalign in display-width-based
 * terminals. That is a known limitation, generally acceptable for LLM consumption.
 */

/** Number of code points in `text`. */
export function codePointLength(text: string): number {
  let length = 0
  for (const _ of text) length += 1
  return length
}

/** The first `count` code points of `text`. */
export function sliceCodePoints(text: string, count: number): string {
  let result = ''
  let taken = 0
  for (const char of text) {
    if (taken >= count) break
    result += char
    taken += 1
  }
  return result
}

/** Pad `text` on the right with spaces to `width` code points. */
export function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - codePointLength(text)))
}

/** Pad `text` on the left with spaces to `width` code points. */
export function padStart(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - codePointLength(text))) + text
}

/** Prefix every non-blank line of `text`; blank lines stay untouched. */
export function indentLines(text: string, prefix: string): string {
  if (prefix === '') return text
  return text
    .split('\n')
    .map(line => (line.trim() === '' ? line : prefix + line))
    .join('\n')
}
