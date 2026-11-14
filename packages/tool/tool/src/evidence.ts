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

export const LEDGER_OWNER = '@omne-harness/tool'

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value))
}

export function sameFactValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right)
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

export type EvidenceKind =
  | 'body-write'
  | 'page-lease'
  | 'body-expiration'
  | 'result-custody'
  | 'result-preparation'
  | 'state'
  | 'result'
  | 'delivery'
  | 'operation'
  | 'account'
  | 'fact-event'
  | 'fact-custody'
  | 'fact-reader'

export type EvidenceLocator = Readonly<{ tenant: TenantId; call: ToolCallId }> &
  Readonly<Record<string, string | TenantId>>

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

function minted<T>(decoded: Outcome<T, Readonly<{ reason: string }>>, text: string): T {
  if ('failure' in decoded) throw new Error(`ledger minted an illegal identity: ${text}`)
  return decoded.ok
}

export const INITIAL_REVISION: ToolRevision = minted(decodeToolRevision('0'), '0')

export function nextRevision(current: ToolRevision): ToolRevision {
  const text = (BigInt(current) + 1n).toString()
  return minted(decodeToolRevision(text), text)
}

export function isLaterRevision(revision: ToolRevision, than: ToolRevision): boolean {
  return BigInt(revision) > BigInt(than)
}

export function resultVersion(ordinal: number): ToolResultVersion {
  return minted(decodeToolResultVersion(`v${ordinal}`), `v${ordinal}`)
}

export const FIRST_RESULT_VERSION = resultVersion(1)

export function deliveryId(ordinal: number): ToolDeliveryId {
  return minted(decodeToolDeliveryId(`d${ordinal}`), `d${ordinal}`)
}

export function factTaskOperation(
  purpose: 'settle' | 'fact-ack' | 'facts-blocked' | 'final-material',
  locator: unknown,
) {
  const text = `${purpose}:${digestOf(locator)}`
  return minted(decodeToolOperationId(text), text)
}
