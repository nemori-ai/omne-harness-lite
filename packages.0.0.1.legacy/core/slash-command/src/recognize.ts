import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS } from '@omne-harness-lite/identity-values'
import type { Recognition } from './types.ts'

export function whitespace(char: string): boolean {
  return OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS.includes(char.codePointAt(0) ?? -1)
}
/** Caller supplies delivery-surface text as a well-formed Unicode scalar sequence. */
export function recognize(text: string): Recognition {
  if (typeof text !== 'string' || !text.isWellFormed())
    throw new TypeError('well-formed Unicode input required')
  const points = Array.from(text)
  if (points[0] !== '/') return Object.freeze({ kind: 'text', text })
  if (points[1] === '/') return Object.freeze({ kind: 'literal', text: points.slice(1).join('') })
  let end = 1
  while (end < points.length && !whitespace(points[end] ?? '')) end++
  const name = points.slice(1, end).join('')
  if (name.length === 0 || name.includes('/')) return Object.freeze({ kind: 'text', text })
  let argumentStart = end
  let argumentEnd = points.length
  while (argumentStart < argumentEnd && whitespace(points[argumentStart] ?? '')) argumentStart++
  while (argumentEnd > argumentStart && whitespace(points[argumentEnd - 1] ?? '')) argumentEnd--
  return Object.freeze({
    kind: 'invocation',
    invocation: Object.freeze({
      raw: text,
      name,
      argumentText: points.slice(argumentStart, argumentEnd).join(''),
      span: Object.freeze({ start: 0, end }),
    }),
  })
}
