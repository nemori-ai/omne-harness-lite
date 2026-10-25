// Evidence and identities that the ledger mints: canonical JSON digests, durable evidence
// references, domain revisions and result/delivery identities. Each evidence names its own record,
// so one evidence is never reused for another purpose.
import { createHash } from 'node:crypto'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type DurableEvidence,
  type ToolCallId,
  type ToolDeliveryId,
  type ToolResultVersion,
  type ToolRevision,
} from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolRevision,
} from '@omne-harness/tool-contract/provider'
import type { TenantId } from './ledger-store.ts'

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
  if (typeof value === 'object' && value !== null)
    return Array.isArray(value) ? value.map(canonical) : canonicalObject(value)
  return canonicalScalar(value)
}

function canonicalScalar(value: unknown): unknown {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new TypeError(`a ${typeof value} has no canonical JSON`)
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new TypeError('a non-finite number has no canonical JSON')
  return value
}

function canonicalObject(value: object): Record<string, unknown> {
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

/** The record kinds the ledger mints evidence for. Each kind is one purpose (P01, P08, P09). */
export type EvidenceKind =
  | 'state'
  | 'result'
  | 'delivery'
  | 'operation'
  | 'account'
  | 'fact-event'
  | 'fact-custody'
  | 'fact-reader'

/**
 * Where an evidence points: always the tenant and the call, because the identity of every Tool
 * record is `(tenant, call, ...)` (P01), plus the parts of its own kind, such as the result
 * version and the delivery.
 */
export type EvidenceLocator = Readonly<{ tenant: TenantId; call: ToolCallId }> &
  Readonly<Record<string, string | TenantId>>

/**
 * A durable evidence of one record committed at `revision` with `content`. The record text is
 * the kind and the canonical JSON of the locator, with the tenant as its two identity texts, so
 * no locator text can collide with another. The digest covers the kind, the locator and the
 * content, so two tenants with the same call identity never share an evidence.
 */
export function mintEvidence(
  kind: EvidenceKind,
  locator: EvidenceLocator,
  revision: ToolRevision,
  content: unknown,
): DurableEvidence {
  const place = {
    ...locator,
    tenant: {
      organization: locator.tenant.organization.text,
      account: locator.tenant.account.text,
    },
  }
  return Object.freeze({
    owner: LEDGER_OWNER,
    record: `${kind}:${canonicalJson(place)}`,
    revision,
    digest: digestOf({ kind, place, content }),
  })
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

/** Whether `revision` was committed after `than`: revisions are decimal counts, not texts. */
export function isLaterRevision(revision: ToolRevision, than: ToolRevision): boolean {
  return BigInt(revision) > BigInt(than)
}

export function resultVersion(ordinal: number): ToolResultVersion {
  return minted(decodeToolResultVersion(`v${ordinal}`), `v${ordinal}`)
}

export function deliveryId(ordinal: number): ToolDeliveryId {
  return minted(decodeToolDeliveryId(`d${ordinal}`), `d${ordinal}`)
}

/** Purpose and full locator determine a distinct task identity within the call domain. */
export function factTaskOperation(
  purpose: 'settle' | 'fact-ack' | 'facts-blocked',
  locator: unknown,
) {
  const text = `${purpose}:${digestOf(locator)}`
  return minted(decodeToolOperationId(text), text)
}
