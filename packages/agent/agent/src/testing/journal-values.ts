// Value helpers of the memory Journal: the semantic key that recognizes "the same input", the brands
// that the Journal mints, and a set that cannot change after construction.
import {
  decodeExecutionAttachmentId,
  decodeExecutionRevision,
  decodeInputBatchId,
  type DurableEvidence,
  type ExecutionAttachmentId,
  type ExecutionRevision,
  type InputBatchId,
} from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { canonical } from '../canonical.ts'

/** The owner name of every evidence that the memory Journal mints. */
export const JOURNAL_OWNER = 'memory-agent-journal'

/**
 * The semantic key of one write: the method and the canonical text of the input without its Access
 * members `principal` and `tenant`.
 */
export function semanticKey(method: string, input: object): string {
  const rest = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== 'principal' && key !== 'tenant'),
  )
  return `${method}:${canonical(rest)}`
}

function minted<T>(decoded: Outcome<T, unknown>, text: string): T {
  // The Journal builds every text below from identities that already passed their decoders and
  // from decimal counters, so a decode failure is a defect of this file, not a caller error.
  if ('failure' in decoded) throw new Error(`memory Journal minted an invalid identity: ${text}`)
  return decoded.ok
}

export function revisionOf(value: number): ExecutionRevision {
  const text = String(value)
  return minted(decodeExecutionRevision(text), text)
}

export function attachmentIdOf(execution: string, ordinal: number): ExecutionAttachmentId {
  const text = `${execution}/attachment/${ordinal}`
  return minted(decodeExecutionAttachmentId(text), text)
}

export function batchIdOf(execution: string, from: number, to: number): InputBatchId {
  const text = `${execution}/batch/${from}-${to}`
  return minted(decodeInputBatchId(text), text)
}

export function journalEvidence(record: string, revision: number): DurableEvidence {
  return {
    owner: JOURNAL_OWNER,
    record,
    revision: String(revision),
    digest: `memory:${record}@${revision}`,
  }
}

/** Parses a decimal sequence text: `null` and `"0"` are 0. Anything else is `undefined`. */
export function sequenceOf(text: string | null): number | undefined {
  if (text === null) return 0
  if (!/^(0|[1-9]\d*)$/u.test(text)) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : undefined
}

/** A read-only view of a set that the view's holder cannot change, even with a cast. */
export function frozenSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const inner = new Set(values)
  const view: ReadonlySet<T> = {
    get size() {
      return inner.size
    },
    has: value => inner.has(value),
    forEach(callback, thisArg?: unknown) {
      inner.forEach(value => callback.call(thisArg, value, value, view))
    },
    entries: () => inner.entries(),
    keys: () => inner.keys(),
    values: () => inner.values(),
    [Symbol.iterator]: () => inner.values(),
  }
  return Object.freeze(view)
}
