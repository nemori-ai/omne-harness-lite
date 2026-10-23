// Checkable evidence of a decision or a fact (SPEC AU-11). A reader recomputes the digest from the
// basis that the decision carries and compares it; the owner, record and revision say where the
// facts came from.
import { createHash } from 'node:crypto'

/** A reference to one checkable record of one owner. The four members are what consumer contracts map, one by one. */
export type EvidenceRef = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>

/** Evidence that authorization produced. `revision` is the revision of the identity fact the decision rests on, or `0` when no fact was read. */
export type DecisionEvidence = EvidenceRef & Readonly<{ owner: 'authorization' }>

function byCodeUnit(left: string, right: string): number {
  if (left < right) return -1
  return left > right ? 1 : 0
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value !== 'object' || value === null) return value
  const members = Object.entries(value)
    .filter(([, member]) => member !== undefined)
    .sort(([left], [right]) => byCodeUnit(left, right))
  return Object.fromEntries(members.map(([name, member]) => [name, canonicalValue(member)]))
}

/** The canonical JSON text of plain data: member names in code-unit order, arrays in order, undefined members dropped. */
export function canonicalText(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

/** The SHA-256 hex digest of the canonical text of plain data. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalText(value)).digest('hex')
}

export function decisionEvidence(
  record: string,
  revision: string,
  content: unknown,
): DecisionEvidence {
  return Object.freeze({ owner: 'authorization', record, revision, digest: digestOf(content) })
}
