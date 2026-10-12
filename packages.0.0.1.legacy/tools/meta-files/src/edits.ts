import { createTwoFilesPatch } from 'diff'
import type { FilesOptions } from './types.ts'
import type { Edit } from './arguments.ts'
import { label } from './result.ts'

function location(
  original: string,
  edit: Edit,
): { start: number; end: number; replacement: string } | { reason: string } {
  const positions: number[] = []
  // Include overlapping occurrences. Selecting an occurrence must be explicit.
  for (
    let at = original.indexOf(edit.match.text);
    at >= 0;
    at = original.indexOf(edit.match.text, at + 1)
  ) {
    positions.push(at)
    if (edit.match.occurrence !== undefined && positions.length === edit.match.occurrence) break
    if (edit.match.occurrence === undefined && positions.length === 2) break
  }
  if (positions.length === 0) return { reason: 'edit:noMatch' }
  if (edit.match.occurrence === undefined && positions.length !== 1)
    return { reason: 'edit:ambiguousMatch' }
  const start = positions[(edit.match.occurrence ?? 1) - 1]
  if (start === undefined) return { reason: 'edit:missingOccurrence' }
  return { start, end: start + edit.match.text.length, replacement: edit.replacement }
}
export function applyEdits(
  original: string,
  edits: readonly Edit[],
): { text: string } | { reason: string } {
  const positions: { start: number; end: number; replacement: string }[] = []
  for (const edit of edits) {
    const found = location(original, edit)
    if ('reason' in found) return found
    positions.push(found)
  }
  positions.sort((a, b) => a.start - b.start)
  for (let index = 1; index < positions.length; index++) {
    if (positions[index]!.start < positions[index - 1]!.end) return { reason: 'edit:overlap' }
  }
  let text = original
  for (const part of positions.reverse())
    text = text.slice(0, part.start) + part.replacement + text.slice(part.end)
  return { text }
}
export function unifiedDiff(
  path: string,
  before: string,
  after: string,
  options: FilesOptions,
): { diff: string } | { reason: string } {
  const result = createTwoFilesPatch(
    `a/${label(path)}`,
    `b/${label(path)}`,
    before,
    after,
    undefined,
    undefined,
    { context: 3, timeout: options.diffTimeoutMs, maxEditLength: options.diffMaxEditLength },
  )
  if (result === undefined) return { reason: 'diff:budgetExceeded' }
  if (result.length <= options.maxDiffChars) return { diff: result }
  // Only presentation is clipped. This is not an applicable complete patch.
  const prefix = Array.from(result).slice(0, options.maxDiffChars).join('')
  return { diff: `${prefix}\n[diff display truncated; not a complete patch]\n` }
}
