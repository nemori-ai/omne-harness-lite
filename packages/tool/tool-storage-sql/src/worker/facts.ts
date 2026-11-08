import { parseHistoryCleanup, type HistoryCleanupFacts } from './history-cleanup.ts'
// The facts that the adapters put into one `tool` command, the answers the participant gives, and
// the inputs and outputs of the read handlers. The adapters build these values and the Worker
// modules parse them, so the protocol has one definition. Every value is strict JSON.
import type { JsonValue } from '@omne-harness/sql-contract'
import { parseMaterialFacts, type MaterialFacts } from './material-facts.ts'
import { countOf, isObject, textOf, type JsonObject } from './support.ts'

/** The three ledger domain kinds; `name` is the call, the queue key or the host key. */
export type DomainKind = 'call' | 'queue' | 'host'

export type DomainAddress = Readonly<{ tenant: string; kind: DomainKind; name: string }>

export type LedgerWriteFact =
  | Readonly<{ op: 'put'; key: string; record: JsonValue }>
  | Readonly<{ op: 'delete'; key: string }>

/** One revision-conditioned commit of one ledger domain. */
export type LedgerFacts = DomainAddress &
  Readonly<{
    intent: 'ledger'
    expected: string
    revision: string
    writes: readonly LedgerWriteFact[]
  }>

/** A host CAS conditional on a previously checked call snapshot in the same tenant. */
export type GuardedHostFacts = Readonly<{
  intent: 'guarded-host'
  call: DomainAddress
  callExpected: string
  hostCommit: LedgerFacts
}>

/** The key of one original or retained projection: the operation that kept it. */
export type CustodyAddress = Readonly<{ tenant: string; call: string; operation: string }>

/** One chunk of the bytes kept under `operation`. `digest` names the whole custody input. */
export type ChunkFacts = CustodyAddress &
  Readonly<{ intent: 'chunk'; digest: string; index: number; data: string }>

export type ManifestKind = 'raw' | 'retain'

export type ManifestFacts = CustodyAddress &
  Readonly<{
    intent: 'manifest'
    kind: 'raw'
    digest: string
    bytes: number
    chunks: number
    sha256: string
    seal: string
    answer: JsonValue
    holds: null
  }>

export type ToolFacts =
  | HistoryCleanupFacts
  | LedgerFacts
  | GuardedHostFacts
  | ChunkFacts
  | ManifestFacts
  | MaterialFacts

/** Why the participant stopped a command; the adapters map each reason to one port answer. */
export type StopBasis =
  | Readonly<{ reason: 'revision'; current: string }>
  | Readonly<{ reason: 'call-changed' }>
  | Readonly<{ reason: 'operation' }>
  | Readonly<{ reason: 'chunks' }>

export type ParticipantAnswer =
  | Readonly<{ kind: 'committed' }>
  | Readonly<{ kind: 'chunk' }>
  | Readonly<{ kind: 'sealed'; answer: JsonValue }>

/** One stored record with the key it is stored under, so the reader can check the two agree. */
export type StoredRecord = Readonly<{ key: string; record: JsonValue }>

export type LedgerReadOutput = Readonly<{
  revision: string | null
  records: readonly StoredRecord[]
}>

export type ManifestRow = Readonly<{
  kind: ManifestKind
  digest: string
  bytes: string
  chunks: string
  sha256: string
  seal: string
  answer: JsonValue
}>

export type ManifestReadOutput = Readonly<{ manifest: ManifestRow | null }>

export type ChunkReadInput = CustodyAddress & Readonly<{ index: number }>

export type ChunkReadOutput = Readonly<{ data: string | null }>

// ---------------------------------------------------------------------------------------------
// The parse of the facts and handler inputs, where they enter a Worker module
// ---------------------------------------------------------------------------------------------

const isDomainKind = (value: JsonValue | undefined): value is DomainKind =>
  value === 'call' || value === 'queue' || value === 'host'

function domainOf(value: JsonObject): DomainAddress | null {
  const tenant = textOf(value, 'tenant')
  const kind = value['kind']
  const name = textOf(value, 'name')
  if (tenant === null || name === null || !isDomainKind(kind)) return null
  return { tenant, kind, name }
}

export function custodyAddressOf(value: JsonValue): CustodyAddress | null {
  if (!isObject(value)) return null
  const tenant = textOf(value, 'tenant')
  const call = textOf(value, 'call')
  const operation = textOf(value, 'operation')
  return tenant === null || call === null || operation === null ? null : { tenant, call, operation }
}

function writeOf(value: JsonValue): LedgerWriteFact | null {
  if (!isObject(value)) return null
  const key = textOf(value, 'key')
  if (key === null) return null
  if (value['op'] === 'delete') return { op: 'delete', key }
  const record = value['record']
  return value['op'] === 'put' && record !== undefined ? { op: 'put', key, record } : null
}

function ledgerOf(value: JsonObject): LedgerFacts | null {
  const domain = domainOf(value)
  const expected = textOf(value, 'expected')
  const revision = textOf(value, 'revision')
  const writes = value['writes']
  if (domain === null || expected === null || revision === null || !Array.isArray(writes))
    return null
  const parsed = writes.map(writeOf)
  if (!parsed.every((write): write is LedgerWriteFact => write !== null)) return null
  return { ...domain, intent: 'ledger', expected, revision, writes: parsed }
}

function guardedHostOf(value: JsonObject): GuardedHostFacts | null {
  const callValue = value['call']
  const hostValue = value['hostCommit']
  const call = isObject(callValue) ? domainOf(callValue) : null
  const hostCommit = isObject(hostValue) ? ledgerOf(hostValue) : null
  const callExpected = textOf(value, 'callExpected')
  if (
    call?.kind !== 'call' ||
    hostCommit?.kind !== 'host' ||
    callExpected === null ||
    call.tenant !== hostCommit.tenant
  )
    return null
  return { intent: 'guarded-host', call, callExpected, hostCommit }
}

function chunkOf(value: JsonObject): ChunkFacts | null {
  const address = custodyAddressOf(value)
  const digest = textOf(value, 'digest')
  const index = countOf(value, 'index')
  const data = value['data']
  if (address === null || digest === null || index === null || typeof data !== 'string') return null
  return { ...address, intent: 'chunk', digest, index, data }
}

/** What a manifest declares about the kept bytes and its own answer. */
function declaredOf(
  value: JsonObject,
): Pick<ManifestFacts, 'digest' | 'sha256' | 'seal' | 'answer'> | null {
  const digest = textOf(value, 'digest')
  const sha256 = textOf(value, 'sha256')
  const seal = textOf(value, 'seal')
  const answer = value['answer']
  return digest === null || sha256 === null || seal === null || answer === undefined
    ? null
    : { digest, sha256, seal, answer }
}

function manifestOf(value: JsonObject): ManifestFacts | null {
  const address = custodyAddressOf(value)
  const kind = value['kind']
  const declared = declaredOf(value)
  const bytes = countOf(value, 'bytes')
  const chunks = countOf(value, 'chunks')
  const holds = value['holds']
  if (
    address === null ||
    kind !== 'raw' ||
    declared === null ||
    bytes === null ||
    chunks === null ||
    holds !== null
  )
    return null
  return { ...address, ...declared, intent: 'manifest', kind, bytes, chunks, holds }
}

/** The facts of one `tool` command, or null when they are not a command of this protocol. */
export function parseFacts(facts: JsonObject): ToolFacts | null {
  switch (facts['intent']) {
    case 'history-cleanup':
      return parseHistoryCleanup(facts)
    case 'ledger':
      return ledgerOf(facts)
    case 'guarded-host':
      return guardedHostOf(facts)
    case 'chunk':
      return chunkOf(facts)
    case 'manifest':
      return manifestOf(facts)
    default:
      return parseMaterialFacts(facts)
  }
}

export function parseDomainAddress(value: JsonValue): DomainAddress | null {
  return isObject(value) ? domainOf(value) : null
}

export function parseChunkInput(value: JsonValue): ChunkReadInput | null {
  const address = custodyAddressOf(value)
  if (address === null || !isObject(value)) return null
  const index = countOf(value, 'index')
  return index === null ? null : { ...address, index }
}
