// The first screen of an offloaded body: a header of fixed fields, outside the preview budget, and a
// format-aligned excerpt within it (Disclosure model: `Screen`, PreviewWithinBudget).
import { readJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import { formatUsage } from '@omne-harness/unix-format'
import type { ToolBodyRepresentation, ToolSchemaIdentity } from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  decodeToolInvocationRef,
  decodeToolResultVersion,
  TOOL_IDENTITY_MAX_LENGTH,
} from '@omne-harness/tool-contract/provider'
import { encodeBodyReference } from './tools-protocol.ts'

export type BodyHeaderFields = Readonly<{
  representation: ToolBodyRepresentation
  bodyBytes: number
  /** Lines of a text body or records of a JSON Lines body; null when the count is not known. */
  units: number | null
  retentionMs: number
  reference: string
}>

/** Names the body and how to read it back, one field per line. A schema appears only by identity. */
export function bodyHeader(fields: BodyHeaderFields): string {
  const { representation } = fields
  const lines = [
    '',
    '[offloaded body]',
    `Body format: ${representation.kind}`,
    `Body bytes: ${fields.bodyBytes}`,
  ]
  if (fields.units !== null && representation.kind === 'text') lines.push(`Lines: ${fields.units}`)
  if (representation.kind === 'json-lines') {
    if (fields.units !== null) lines.push(`Records: ${fields.units}`)
    lines.push(`Record schema: ${schemaName(representation.recordSchema)}`)
  }
  if (representation.kind === 'json-document')
    lines.push(`Schema: ${schemaName(representation.schema)}`)
  lines.push(
    `Retention: ${fields.retentionMs} ms from result publication; reads do not renew it.`,
    'The body may already have expired when this result is delivered.',
    'Read it back with:',
    formatUsage(
      'Tools',
      'read_result',
      JSON.stringify({ kind: 'body', reference: fields.reference, after: null }),
    ),
  )
  return `${lines.join('\n')}\n`
}

function schemaName(identity: ToolSchemaIdentity): string {
  return `${identity.id}@${identity.revision} (${identity.digest})`
}

/**
 * The largest header any body under this declaration can get: every count at the body hard limit
 * and the reference built from identities at the contract length limit. The header shows the
 * reference raw, one byte per identity character.
 */
export function headerMax(
  representation: ToolBodyRepresentation,
  retentionMs: number,
  maxBodyBytes: number,
): number {
  return utf8Bytes(
    bodyHeader({
      representation,
      bodyBytes: maxBodyBytes,
      units: maxBodyBytes,
      retentionMs,
      reference: LONGEST_REFERENCE,
    }),
  )
}

const LONGEST_REFERENCE = longestReference()

function longestReference(): string {
  const identity = '~'.repeat(TOOL_IDENTITY_MAX_LENGTH)
  const reference = decodeToolInvocationRef(
    JSON.stringify(['tool-invocation', 2, identity, identity]),
  )
  const result = decodeToolResultVersion(identity)
  const bodyId = decodeToolBodyId(identity)
  if ('failure' in reference || 'failure' in result || 'failure' in bodyId)
    throw new TypeError('the longest contract identities no longer decode')
  return encodeBodyReference({ reference: reference.ok, result: result.ok, bodyId: bodyId.ok })
}

export function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/** Lines of a text body, records of a JSON Lines body, null for a document. */
export function bodyUnits(representation: ToolBodyRepresentation, text: string): number | null {
  return representation.kind === 'json-document' ? null : splitLines(text).length
}

/**
 * A mechanical excerpt of `text` within `budget` UTF-8 bytes. Text keeps whole lines from the head
 * and the tail at about 2:1; JSON Lines keeps whole records; a JSON document gives an outline, never
 * a cut JSON text. `limits` are the limits the body was validated with.
 */
export function mechanicalPreview(
  representation: ToolBodyRepresentation,
  text: string,
  budget: number,
  limits: JsonLimits | null,
): string {
  switch (representation.kind) {
    case 'text':
      return headTail(splitLines(text), budget, cutLine)
    case 'json-lines':
      return headTail(splitLines(text), budget, recordPosition)
    case 'json-document':
      return documentOutline(text, budget, limits)
  }
}

const OMITTED = '[... omitted ...]\n'
const CUT = '[line cut at a character boundary]\n'

type Unit = Readonly<{ text: string; index: number; count: number }>
/** Stands in for one unit larger than the room on its side. */
type Oversize = (unit: Unit, room: number, side: 'head' | 'tail') => string

function splitLines(text: string): Unit[] {
  const parts = text.split(/(?<=\n)/u).filter(part => part.length > 0)
  return parts.map((part, index) => ({ text: part, index, count: parts.length }))
}

function headTail(units: readonly Unit[], budget: number, oversize: Oversize): string {
  const available = budget - utf8Bytes(OMITTED)
  if (available <= 0) return ''
  const headRoom = Math.floor((available * 2) / 3)
  const taken = takeWhole(units, headRoom)
  const first = units[0]
  const head =
    taken.length === 0 && first !== undefined ? oversize(first, headRoom, 'head') : joined(taken)
  const rest = units.slice(Math.max(taken.length, head.length > 0 ? 1 : 0))
  const tailRoom = available - utf8Bytes(head)
  const tailTaken = [...takeWhole([...rest].reverse(), tailRoom)].reverse()
  const last = rest.at(-1)
  const tail =
    tailTaken.length === 0 && last !== undefined
      ? oversize(last, tailRoom, 'tail')
      : joined(tailTaken)
  return `${head}${OMITTED}${tail}`
}

function takeWhole(units: readonly Unit[], room: number): readonly Unit[] {
  let used = 0
  let taken = 0
  for (const unit of units) {
    used += utf8Bytes(unit.text)
    if (used > room) break
    taken += 1
  }
  return units.slice(0, taken)
}

function joined(units: readonly Unit[]): string {
  return units.map(unit => unit.text).join('')
}

function cutLine(unit: Unit, room: number, side: 'head' | 'tail'): string {
  const keep = room - utf8Bytes(CUT) - 1
  if (keep <= 0) return ''
  const bytes = Buffer.from(unit.text.replace(/\n$/u, ''), 'utf8')
  return side === 'head'
    ? `${utf8Slice(bytes, 0, keep)}\n${CUT}`
    : `${CUT}${utf8Slice(bytes, bytes.length - keep, bytes.length)}\n`
}

function recordPosition(unit: Unit, room: number): string {
  const label = `[record ${unit.index + 1} of ${unit.count}: ${utf8Bytes(unit.text)} bytes, too large to show]\n`
  return utf8Bytes(label) <= room ? label : ''
}

function utf8Slice(bytes: Uint8Array, from: number, to: number): string {
  let start = Math.max(0, from)
  let end = Math.min(bytes.length, to)
  while (start < end && ((bytes[start] ?? 0) & 0xc0) === 0x80) start += 1
  while (end > start && end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end))
}

const OUTLINE = 'Outline (breadth-first, document key order):\n'
const TRUNCATED = '[outline truncated]\n'

function documentOutline(text: string, budget: number, limits: JsonLimits | null): string {
  const read = limits === null ? null : readJsonText(text, limits)
  if (read?.kind !== 'ok') return ''
  const room = budget - utf8Bytes(TRUNCATED)
  if (utf8Bytes(OUTLINE) > room) return ''
  let out = OUTLINE
  const queue: Array<Readonly<{ path: string; value: JsonValue }>> = [
    { path: '$', value: read.value },
  ]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const line = `${next.path}: ${describe(next.value)}\n`
    if (utf8Bytes(out) + utf8Bytes(line) > room) return `${out}${TRUNCATED}`
    out += line
    queue.push(...children(next.path, next.value))
  }
  return out
}

function describe(value: JsonValue): string {
  if (value.kind === 'array') return `array (${value.items.length} items)`
  if (value.kind === 'object') return `object (${value.entries.length} keys)`
  return value.kind
}

function children(
  path: string,
  value: JsonValue,
): Array<Readonly<{ path: string; value: JsonValue }>> {
  if (value.kind === 'object')
    return value.entries.map(entry => ({
      path: `${path}.${JSON.stringify(entry.key)}`,
      value: entry.value,
    }))
  if (value.kind === 'array' && value.items[0] !== undefined)
    return [{ path: `${path}[0]`, value: value.items[0] }]
  return []
}
