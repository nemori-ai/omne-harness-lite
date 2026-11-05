import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
} from '@omne-harness/tool'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { toJson } from './json.ts'
import type { SqlToolStorageOptions } from './options.ts'
import type { DomainAddress, LedgerWriteFact, StopBasis } from './worker/facts.ts'
import { isObject } from './worker/support.ts'

export const unavailable = (diagnostic: string) => ({ kind: 'unavailable', diagnostic }) as const

export function addressOf(tenant: string, domain: LedgerDomain): DomainAddress {
  return { tenant, kind: domain.kind, name: domain.kind === 'call' ? domain.call : domain.key }
}

export function writesOf<B extends ContentBlock>(
  input: LedgerCommitInput<B>,
): readonly LedgerWriteFact[] {
  return input.writes.map((write, index) =>
    write.kind === 'put'
      ? {
          op: 'put',
          key: recordKey(write.record),
          record: toJson(write.record, `writes[${index}]`),
        }
      : { op: 'delete', key: write.key },
  )
}

function stopOf(basis: JsonValue): StopBasis | null {
  if (!isObject(basis)) return null
  const current = basis['current']
  return basis['reason'] === 'revision' && typeof current === 'string'
    ? { reason: 'revision', current }
    : null
}

export type CommitAnswer = Awaited<ReturnType<SqlToolStorageOptions['storage']['commit']>>

/** A rolled-back commit: a revision conflict when the participant said so, otherwise unavailable. */
function rolledBack(answer: Extract<CommitAnswer, { kind: 'rolled_back' }>): LedgerCommit {
  const stop = answer.responses[answer.responses.length - 1]?.reply
  const basis = stop?.kind === 'conflict' ? stopOf(stop.basis) : null
  const current = basis?.reason === 'revision' ? decodeToolRevision(basis.current) : null
  if (current !== null && 'ok' in current) return { kind: 'conflict', current: current.ok }
  // A rollback is durable: nothing of the commit took effect.
  return unavailable(
    `ledger commit rolled back: ${stop?.kind === 'failed' ? stop.category : (stop?.kind ?? 'no reply')}`,
  )
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
      return unavailable(`ledger commit rejected: ${answer.reason}`)
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}
