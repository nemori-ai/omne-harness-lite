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

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value !== 'object' || value === null) return value
  // JSON.stringify drops a member whose value is undefined, so no filter is needed here.
  const members = new Map(Object.entries(value))
  // The default sort compares strings by UTF-16 code units, which is the canonical member order.
  const names = [...members.keys()].sort()
  return Object.fromEntries(names.map(name => [name, canonicalValue(members.get(name))]))
}

/** The canonical JSON text of plain data: member names in code-unit order, arrays in order; a member whose value is undefined is absent, as in JSON. */
export function canonicalText(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

/** The SHA-256 hex digest of the canonical text of plain data. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalText(value)).digest('hex')
}

/**
 * The effective arguments of one action, as a digest. The arguments themselves are opaque to
 * authorization: the resource owner or its adapter computes the digest from the fixed
 * representation it executes, and a permit is bound to that digest.
 */
export type EffectiveArguments = Readonly<{ digest: string }>

/** The digest of the arguments' plain data. Give the same representation at grant and at check. */
export function effectiveArgumentsOf(value: unknown): EffectiveArguments {
  return Object.freeze({ digest: digestOf(value) })
}

/** The arguments of an operation that has none: the digest of `null`. */
export function noArguments(): EffectiveArguments {
  return effectiveArgumentsOf(null)
}

export function decisionEvidence(
  record: string,
  revision: string,
  content: unknown,
): DecisionEvidence {
  return Object.freeze({ owner: 'authorization', record, revision, digest: digestOf(content) })
}
