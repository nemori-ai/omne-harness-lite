import {
  commitRejectionNature,
  type CommitRejectReason,
  type JsonValue,
} from '@omne-harness/sql-contract'
import {
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRecord,
} from '@omne-harness/tool'
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

/** Whether `other` names the tenant of `domain`, by the identity texts the ledger partitions on. */
export function sameTenant(domain: LedgerDomain, other: LedgerDomain): boolean {
  return (
    domain.tenant.organization.text === other.tenant.organization.text &&
    domain.tenant.account.text === other.tenant.account.text
  )
}

/** The assertions of a commit as the participant reads them; the tenant is the commit's own. */
export function assertsOf(input: LedgerCommitInput): readonly LedgerAssertionFact[] {
  return (input.asserts ?? []).map(assertion => {
    const { kind, name } = addressOf('', assertion.domain)
    return { kind, name, revision: assertion.revision }
  })
}

/** How a commit sends the fixed part of a record that has one. */
export type FixedMode = 'given' | 'kept'

/**
 * A record in the two parts the store keeps: the part that changes, and the part that is written
 * once. Only the call record has a fixed part: its request, which no step of the call changes.
 */
function partsOf(record: LedgerRecord): Readonly<{ record: unknown; fixed?: unknown }> {
  if (record.kind !== 'call') return { record }
  const { request, ...state } = record.call
  return { record: { kind: record.kind, call: state }, fixed: request }
}

/** The record that `partsOf` took apart, from the two parts a read gives back. */
export function joined(record: JsonValue, fixed: JsonValue | undefined): JsonValue {
  if (fixed === undefined || !isObject(record) || !isObject(record['call'])) return record
  return { ...record, call: { ...record['call'], request: fixed } }
}

function putOf(record: LedgerRecord, path: string, mode: FixedMode): LedgerWriteFact {
  const parts = partsOf(record)
  const put = { op: 'put', key: recordKey(record), record: toJson(parts.record, path) } as const
  if (parts.fixed === undefined) return put
  if (mode === 'kept') return { ...put, fixed: { kind: 'kept' } }
  return { ...put, fixed: { kind: 'given', value: toJson(parts.fixed, path) } }
}

export function writesOf(input: LedgerCommitInput, mode: FixedMode): readonly LedgerWriteFact[] {
  return input.writes.map((write, index): LedgerWriteFact => {
    switch (write.kind) {
      case 'drop':
        return { op: 'drop' }
      case 'put':
        return putOf(write.record, `writes[${index}]`, mode)
      case 'delete':
        return { op: 'delete', key: write.key }
      case 'schedule':
        return { op: 'schedule', key: write.key, dueAt: write.dueAt }
      case 'unschedule':
        return { op: 'unschedule', key: write.key }
      default: {
        const exhaustive: never = write
        return exhaustive
      }
    }
  })
}

function stopOf(basis: JsonValue): StopBasis | null {
  if (!isObject(basis)) return null
  const current = basis['current']
  if (typeof current !== 'string') return null
  if (basis['reason'] === 'revision') return { reason: 'revision', current }
  return basis['reason'] === 'assertion' ? { reason: 'assertion', current } : null
}

export type CommitAnswer = Awaited<ReturnType<SqlToolStorageOptions['storage']['commit']>>

/** Whether the participant stopped a `kept` put: the store holds no fixed part under the key. */
export function lacksFixed(answer: CommitAnswer): boolean {
  if (answer.kind !== 'rolled_back') return false
  const stop = answer.responses[answer.responses.length - 1]?.reply
  return (
    stop?.kind === 'conflict' && isObject(stop.basis) && stop.basis['reason'] === 'fixed-missing'
  )
}

/**
 * Whether the same commit is refused again whenever it is sent (sql-contract「提交拒绝原因的定性」):
 * a definite reason comes from the commit itself or from the assembly.
 */
export function isDefiniteRejection(reason: CommitRejectReason): boolean {
  return commitRejectionNature(reason) === 'definite'
}

/** A write set that is not strict JSON is refused before it is sent: it never becomes JSON. */
export function notJson(error: NotJsonError): LedgerCommit {
  return { kind: 'rejected', reason: error.message }
}

/**
 * A rolled-back commit: a revision conflict when the participant said so. Any other stop (the
 * participant threw, a statement failed) is decided by the input and the committed data, so the
 * same commit fails the same way again (sql-contract §7.6). A rollback is durable: nothing of the
 * commit took effect.
 */
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

/** One ledger commit, read as the answer of the port. */
export function ledgerAnswer(answer: CommitAnswer): LedgerCommit {
  switch (answer.kind) {
    case 'committed':
      return { kind: 'committed' }
    case 'unknown':
      return { kind: 'unknown', diagnostic: `ledger commit: ${answer.diagnostic ?? 'unknown'}` }
    case 'rolled_back':
      return rolledBack(answer)
    case 'identity_conflict':
      // Every commit uses a fresh operation key, so the provider ran none of this commit.
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
