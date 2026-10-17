// Evidence and identities that the ledger mints: canonical JSON digests, durable evidence
// references, domain revisions and result/delivery identities. Each evidence names its own record,
// so one evidence is never reused for another purpose.
import { createHash } from 'node:crypto'
import type { Outcome } from '@omne-harness/kernel-basis'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolRevision,
  type DurableEvidence,
  type ToolDeliveryId,
  type ToolResultVersion,
  type ToolRevision,
} from '@omne-harness/tool-contract'

/** The owner of every evidence the ledger mints. */
export const LEDGER_OWNER = '@omne-harness/tool'

/**
 * The canonical JSON text of a plain data value: object keys sorted by code point, `undefined`
 * members omitted. A value that JSON cannot carry is a defect of the caller, so it throws.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value))
}

function canonical(value: unknown): unknown {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new TypeError(`a ${typeof value} has no canonical JSON`)
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new TypeError('a non-finite number has no canonical JSON')
  if (typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.map(canonical)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    const member: unknown = Reflect.get(value, key)
    if (member !== undefined) out[key] = canonical(member)
  }
  return out
}

export function digestOf(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

/** A durable evidence that points at `record` as committed at `revision` with `content`. */
export function mintEvidence(
  record: string,
  revision: ToolRevision,
  content: unknown,
): DurableEvidence {
  return Object.freeze({ owner: LEDGER_OWNER, record, revision, digest: digestOf(content) })
}

/** Reads an identity the ledger minted itself. A failure is a defect of the ledger's lexicon. */
function minted<T>(decoded: Outcome<T, Readonly<{ reason: string }>>, text: string): T {
  if ('failure' in decoded) throw new Error(`ledger minted an illegal identity: ${text}`)
  return decoded.ok
}

/** The first revision of a domain is `0`; every commit adds one. */
export const INITIAL_REVISION: ToolRevision = minted(decodeToolRevision('0'), '0')

export function nextRevision(current: ToolRevision): ToolRevision {
  const text = (BigInt(current) + 1n).toString()
  return minted(decodeToolRevision(text), text)
}

export function resultVersion(ordinal: number): ToolResultVersion {
  return minted(decodeToolResultVersion(`v${ordinal}`), `v${ordinal}`)
}

export function deliveryId(ordinal: number): ToolDeliveryId {
  return minted(decodeToolDeliveryId(`d${ordinal}`), `d${ordinal}`)
}
