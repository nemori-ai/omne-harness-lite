import type { JsonValue } from '@omne-harness/sql-contract'
import { countOf, isObject, textOf, type JsonObject } from './support.ts'

export type DomainKind = 'call' | 'queue' | 'host'

export type DomainAddress = Readonly<{ tenant: string; kind: DomainKind; name: string }>

export type FixedPart = Readonly<{ kind: 'given'; value: JsonValue }> | Readonly<{ kind: 'kept' }>

export type LedgerWriteFact =
  | Readonly<{ op: 'put'; key: string; record: JsonValue; fixed?: FixedPart }>
  | Readonly<{ op: 'delete'; key: string }>
  | Readonly<{ op: 'schedule'; key: string; dueAt: string }>
  | Readonly<{ op: 'unschedule'; key: string }>
  | Readonly<{ op: 'drop' }>

export type LedgerAssertionFact = Readonly<{ kind: DomainKind; name: string; revision: string }>

export type LedgerFacts = DomainAddress &
  Readonly<{
    intent: 'ledger'
    expected: string
    revision: string
    writes: readonly LedgerWriteFact[]
    asserts: readonly LedgerAssertionFact[]
    pending?: boolean
  }>

export type BodyAddress = Readonly<{ tenant: string; call: string; body: string }>

export type BodyPutFacts = BodyAddress & Readonly<{ intent: 'body-put'; seq: number; data: string }>

export type BodySealFacts = BodyAddress &
  Readonly<{ intent: 'body-seal'; chunks: number; bytes: number; digest: string }>

export type BodyDeleteFacts = BodyAddress & Readonly<{ intent: 'body-delete' }>

export type BodyFacts = BodyPutFacts | BodySealFacts | BodyDeleteFacts

export type ToolFacts = LedgerFacts | BodyFacts

export type StopBasis =
  | Readonly<{ reason: 'revision'; current: string }>
  | Readonly<{ reason: 'assertion'; current: string }>
  | Readonly<{ reason: 'fixed-missing' }>
  | Readonly<{ reason: 'body-conflict' }>
  | Readonly<{ reason: 'body-not-ready'; diagnostic: string }>

export type ParticipantAnswer =
  | Readonly<{ kind: 'committed' }>
  | Readonly<{ kind: 'body-kept' }>
  | Readonly<{ kind: 'body-sealed' }>
  | Readonly<{ kind: 'body-deleted' }>

export type StoredRecord = Readonly<{ key: string; record: JsonValue; fixed?: JsonValue }>

export type LedgerReadOutput = Readonly<{
  revision: string | null
  records: readonly StoredRecord[]
}>

export type PendingReadInput = Readonly<{ tenant: string; after: string | null; limit: number }>

export type PendingReadOutput = Readonly<{ calls: readonly string[]; more: boolean }>

export const PENDING_READ_LIMIT = 1000

export type BodyReadInput = BodyAddress & Readonly<{ first: number; count: number }>

export type BodyReadOutput = Readonly<{
  manifest: Readonly<{ chunks: number; bytes: number; digest: string }> | null
  chunks: readonly Readonly<{ seq: number; data: string }>[]
}>

export type DueReadInput = Readonly<{ tenant: string; now: string; limit: number }>

export type DueReadOutput = Readonly<{
  entries: readonly Readonly<{ kind: DomainKind; name: string; key: string; dueAt: string }>[]
}>

const isDomainKind = (value: JsonValue | undefined): value is DomainKind =>
  value === 'call' || value === 'queue' || value === 'host'

function domainOf(value: JsonObject): DomainAddress | null {
  const tenant = textOf(value, 'tenant')
  const kind = value['kind']
  const name = textOf(value, 'name')
  if (tenant === null || name === null || !isDomainKind(kind)) return null
  return { tenant, kind, name }
}

function fixedOf(value: JsonValue | undefined): FixedPart | null {
  if (!isObject(value)) return null
  if (value['kind'] === 'kept') return { kind: 'kept' }
  const given = value['value']
  return value['kind'] === 'given' && given !== undefined ? { kind: 'given', value: given } : null
}

function writeOf(value: JsonValue): LedgerWriteFact | null {
  if (!isObject(value)) return null
  if (value['op'] === 'drop') return { op: 'drop' }
  const key = textOf(value, 'key')
  if (key === null) return null
  switch (value['op']) {
    case 'delete':
      return { op: 'delete', key }
    case 'unschedule':
      return { op: 'unschedule', key }
    case 'schedule': {
      const dueAt = textOf(value, 'dueAt')
      return dueAt === null ? null : { op: 'schedule', key, dueAt }
    }
    case 'put': {
      const record = value['record']
      if (record === undefined) return null
      if (value['fixed'] === undefined) return { op: 'put', key, record }
      const fixed = fixedOf(value['fixed'])
      return fixed === null ? null : { op: 'put', key, record, fixed }
    }
    default:
      return null
  }
}

export function bodyAddressOf(value: JsonValue): BodyAddress | null {
  if (!isObject(value)) return null
  const tenant = textOf(value, 'tenant')
  const call = textOf(value, 'call')
  const body = textOf(value, 'body')
  return tenant === null || call === null || body === null ? null : { tenant, call, body }
}

function bodyOf(value: JsonObject): BodyFacts | null {
  const address = bodyAddressOf(value)
  if (address === null) return null
  switch (value['intent']) {
    case 'body-put': {
      const seq = countOf(value, 'seq')
      const data = value['data']
      return seq === null || typeof data !== 'string'
        ? null
        : { ...address, intent: 'body-put', seq, data }
    }
    case 'body-seal': {
      const chunks = countOf(value, 'chunks')
      const bytes = countOf(value, 'bytes')
      const digest = textOf(value, 'digest')
      return chunks === null || bytes === null || digest === null
        ? null
        : { ...address, intent: 'body-seal', chunks, bytes, digest }
    }
    case 'body-delete':
      return { ...address, intent: 'body-delete' }
    default:
      return null
  }
}

function assertionOf(value: JsonValue): LedgerAssertionFact | null {
  if (!isObject(value)) return null
  const kind = value['kind']
  const name = textOf(value, 'name')
  const revision = textOf(value, 'revision')
  return name === null || revision === null || !isDomainKind(kind) ? null : { kind, name, revision }
}

function ledgerOf(value: JsonObject): LedgerFacts | null {
  const domain = domainOf(value)
  const expected = textOf(value, 'expected')
  const revision = textOf(value, 'revision')
  const writes = value['writes']
  const asserts = value['asserts']
  if (
    domain === null ||
    expected === null ||
    revision === null ||
    !Array.isArray(writes) ||
    !Array.isArray(asserts)
  )
    return null
  const parsed = writes.map(writeOf)
  if (!parsed.every((write): write is LedgerWriteFact => write !== null)) return null
  const assertions = asserts.map(assertionOf)
  if (!assertions.every((item): item is LedgerAssertionFact => item !== null)) return null
  const facts = { ...domain, intent: 'ledger', expected, revision, writes: parsed } as const
  const pending = value['pending']
  if (pending === undefined) return { ...facts, asserts: assertions }
  if (typeof pending !== 'boolean' || domain.kind !== 'call') return null
  return { ...facts, asserts: assertions, pending }
}

export function parseFacts(facts: JsonObject): ToolFacts | null {
  switch (facts['intent']) {
    case 'ledger':
      return ledgerOf(facts)
    case 'body-put':
    case 'body-seal':
    case 'body-delete':
      return bodyOf(facts)
    default:
      return null
  }
}

export function parseDomainAddress(value: JsonValue): DomainAddress | null {
  return isObject(value) ? domainOf(value) : null
}

export function parsePendingInput(value: JsonValue): PendingReadInput | null {
  if (!isObject(value)) return null
  const tenant = textOf(value, 'tenant')
  const after = value['after'] === null ? null : textOf(value, 'after')
  const limit = countOf(value, 'limit')
  if (tenant === null || (after === null && value['after'] !== null) || limit === null) return null
  return limit < 1 || limit > PENDING_READ_LIMIT ? null : { tenant, after, limit }
}

export function parseBodyReadInput(value: JsonValue): BodyReadInput | null {
  const address = bodyAddressOf(value)
  if (address === null || !isObject(value)) return null
  const first = countOf(value, 'first')
  const count = countOf(value, 'count')
  return first === null || count === null ? null : { ...address, first, count }
}

export function parseDueReadInput(value: JsonValue): DueReadInput | null {
  if (!isObject(value)) return null
  const tenant = textOf(value, 'tenant')
  const now = textOf(value, 'now')
  const limit = countOf(value, 'limit')
  return tenant === null || now === null || limit === null ? null : { tenant, now, limit }
}
