import {
  commitRejectionNature,
  type CommitRejectReason,
  type JsonValue,
} from '@omne-harness/sql-contract'
import {
  canonicalDigest,
  canonicalJson,
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRecord,
} from '@omne-harness/tool'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { toJson, type NotJsonError } from './json.ts'
import type { SqlToolStorageOptions } from './options.ts'
import type {
  DomainAddress,
  LedgerAssertionFact,
  LedgerWriteFact,
  StopBasis,
} from './worker/facts.ts'
import { isObject } from './worker/support.ts'

export const unavailable = (diagnostic: string) => ({ kind: 'unavailable', diagnostic }) as const

export function addressOf(tenant: string, domain: LedgerDomain): DomainAddress {
  return { tenant, kind: domain.kind, name: domain.kind === 'call' ? domain.call : domain.key }
}

export function sameTenant(domain: LedgerDomain, other: LedgerDomain): boolean {
  return (
    domain.tenant.organization.text === other.tenant.organization.text &&
    domain.tenant.account.text === other.tenant.account.text
  )
}

export function assertsOf(input: LedgerCommitInput): readonly LedgerAssertionFact[] {
  return (input.asserts ?? []).map(assertion => {
    const { kind, name } = addressOf('', assertion.domain)
    return { kind, name, revision: assertion.revision }
  })
}

export type FixedMode = 'given' | 'kept'

export type DefinitionText = Readonly<{ digest: string; adoption: string; text: string }>

function partsOf(record: LedgerRecord): Readonly<{ record: unknown; fixed?: FixedToolRequest }> {
  if (record.kind === 'call') {
    const { request, ...state } = record.call
    return { record: { kind: record.kind, call: state }, fixed: request }
  }
  if (record.kind !== 'host' || record.host.request === undefined) return { record }
  const { request, ...host } = record.host
  return { record: { kind: record.kind, host }, fixed: request }
}

function namedDefinition(fixed: JsonValue, definitions: ReadonlyMap<string, JsonValue>) {
  if (!isObject(fixed) || !isObject(fixed['availability'])) return null
  const availability = fixed['availability']
  const digest = availability['definition']
  const definition = typeof digest === 'string' ? definitions.get(digest) : undefined
  return definition === undefined
    ? null
    : { ...fixed, availability: { ...availability, definition } }
}

export function joined(
  record: JsonValue,
  fixed: JsonValue | undefined,
  definitions: ReadonlyMap<string, JsonValue>,
): JsonValue | null {
  if (fixed === undefined || !isObject(record)) return record
  const call = record['call']
  const host = record['host']
  if (!isObject(call) && !isObject(host)) return record
  const request = namedDefinition(fixed, definitions)
  if (request === null) return null
  return isObject(call)
    ? { ...record, call: { ...call, request } }
    : { ...record, host: { ...(host as JsonValue & object), request } }
}

function putOf(
  record: LedgerRecord,
  path: string,
  mode: FixedMode,
  definitions: Map<string, DefinitionText>,
): LedgerWriteFact {
  const parts = partsOf(record)
  const put = { op: 'put', key: recordKey(record), record: toJson(parts.record, path) } as const
  if (parts.fixed === undefined) return put
  if (mode === 'kept') return { ...put, fixed: { kind: 'kept' } }
  const { definition } = parts.fixed.availability
  const text = canonicalJson(toJson(definition, `${path}.request.availability.definition`))
  const digest = canonicalDigest(definition)
  definitions.set(digest, { digest, adoption: canonicalDigest(definition.adoption), text })
  const referenced = {
    ...parts.fixed,
    availability: { ...parts.fixed.availability, definition: digest },
  }
  return { ...put, fixed: { kind: 'given', value: toJson(referenced, path) }, definition: digest }
}

export function writesOf(
  input: LedgerCommitInput,
  mode: FixedMode,
): Readonly<{ writes: readonly LedgerWriteFact[]; definitions: readonly DefinitionText[] }> {
  const definitions = new Map<string, DefinitionText>()
  const writes = input.writes.map((write, index): LedgerWriteFact => {
    switch (write.kind) {
      case 'drop':
        return { op: 'drop' }
      case 'put':
        return putOf(write.record, `writes[${index}]`, mode, definitions)
      case 'delete':
        return { op: 'delete', key: write.key }
      case 'schedule':
        return { op: 'schedule', key: write.key, dueAt: write.dueAt }
      case 'unschedule':
        return { op: 'unschedule', key: write.key }
      case 'usage':
        return {
          op: 'usage',
          call: write.fact.call,
          start: write.fact.start,
          owner: write.fact.consumer.owner,
          work: write.fact.consumer.work,
          fact: toJson(write.fact, `writes[${index}].fact`),
        }
      default: {
        const exhaustive: never = write
        return exhaustive
      }
    }
  })
  return { writes, definitions: [...definitions.values()] }
}

function stopOf(basis: JsonValue): StopBasis | null {
  if (!isObject(basis)) return null
  const current = basis['current']
  if (typeof current !== 'string') return null
  if (basis['reason'] === 'revision') return { reason: 'revision', current }
  return basis['reason'] === 'assertion' ? { reason: 'assertion', current } : null
}

export type CommitAnswer = Awaited<ReturnType<SqlToolStorageOptions['storage']['commit']>>

function stoppedFor(answer: CommitAnswer, reason: string): boolean {
  if (answer.kind !== 'rolled_back') return false
  const stop = answer.responses[answer.responses.length - 1]?.reply
  return stop?.kind === 'conflict' && isObject(stop.basis) && stop.basis['reason'] === reason
}

export function lacksFixed(answer: CommitAnswer): boolean {
  return stoppedFor(answer, 'fixed-missing')
}

export function lacksDefinition(answer: CommitAnswer): boolean {
  return stoppedFor(answer, 'definition-missing')
}

export function isDefiniteRejection(reason: CommitRejectReason): boolean {
  return commitRejectionNature(reason) === 'definite'
}

export function notJson(error: NotJsonError): LedgerCommit {
  return { kind: 'rejected', reason: error.message }
}

function rolledBack(answer: Extract<CommitAnswer, { kind: 'rolled_back' }>): LedgerCommit {
  const stop = answer.responses[answer.responses.length - 1]?.reply
  const basis = stop?.kind === 'conflict' ? stopOf(stop.basis) : null
  const current =
    basis?.reason === 'revision' || basis?.reason === 'assertion'
      ? decodeToolRevision(basis.current)
      : null
  if (current !== null && 'ok' in current) return { kind: 'conflict', current: current.ok }
  return {
    kind: 'rejected',
    reason: stop?.kind === 'failed' ? stop.category : (stop?.kind ?? 'no reply'),
  }
}

export function ledgerAnswer(answer: CommitAnswer): LedgerCommit {
  switch (answer.kind) {
    case 'committed':
      return { kind: 'committed' }
    case 'unknown':
      return { kind: 'unknown', diagnostic: `ledger commit: ${answer.diagnostic ?? 'unknown'}` }
    case 'rolled_back':
      return rolledBack(answer)
    case 'identity_conflict':
      return unavailable('ledger commit: the operation key was already used')
    case 'rejected_before_accept':
      return isDefiniteRejection(answer.reason)
        ? { kind: 'rejected', reason: answer.reason }
        : unavailable(`ledger commit rejected: ${answer.reason}`)
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}
