// The durable ToolLedgerStore (G1) over the SQL storage contract. A ledger domain (`call`, `queue`
// or `host`) is a group of rows with its own revision inside the transaction domain of its tenant.
// `read` is one `domain-serial` read; `commit` is one SQL commit whose participant checks the
// expected revision, applies the writes in order and sets the new revision, or writes nothing.
import { randomUUID } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRead,
  type LedgerRecord,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { NotJsonError, toJson } from './json.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { requestOf, resolveTenant } from './tenant.ts'
import type { DomainAddress, LedgerFacts, LedgerWriteFact, StopBasis } from './worker/facts.ts'
import { LEDGER_READ_HANDLER, PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

export type SqlToolLedgerStore<B extends ContentBlock> = ToolLedgerStore<B> &
  Readonly<{ durability: 'durable' }>

const unavailable = (diagnostic: string) => ({ kind: 'unavailable', diagnostic }) as const

function addressOf(tenant: string, domain: LedgerDomain): DomainAddress {
  return { tenant, kind: domain.kind, name: domain.kind === 'call' ? domain.call : domain.key }
}

/**
 * The records of a read. The store interprets no record: it only checks that each one is the
 * record its row key names, so a row that does not hold its own record is reported, never served.
 */
function recordsOf<B extends ContentBlock>(rows: JsonValue | undefined): LedgerRecord<B>[] | null {
  if (!Array.isArray(rows)) return null
  const records: LedgerRecord<B>[] = []
  for (const row of rows) {
    if (!isObject(row) || typeof row['key'] !== 'string' || !isObject(row['record'])) return null
    // The rows hold only records this store wrote from LedgerRecord values; the key check below
    // is the integrity check of that claim.
    const record = row['record'] as unknown as LedgerRecord<B>
    if (typeof record.kind !== 'string' || recordKey(record) !== row['key']) return null
    records.push(record)
  }
  return records
}

function writesOf<B extends ContentBlock>(input: LedgerCommitInput<B>): readonly LedgerWriteFact[] {
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

type CommitAnswer = Awaited<ReturnType<SqlToolStorageOptions['storage']['commit']>>

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
function ledgerAnswer(answer: CommitAnswer): LedgerCommit {
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

export function createSqlToolLedgerStore<B extends ContentBlock = ContentBlock>(
  options: SqlToolStorageOptions,
): SqlToolLedgerStore<B> {
  const read = async (domain: LedgerDomain): Promise<LedgerRead<B>> => {
    const resolved = await resolveTenant(options, domain.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    const answer = await options.storage.read({
      domain: resolved.at.domain,
      handler: LEDGER_READ_HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: addressOf(resolved.at.tenant, domain),
    })
    if (answer.kind !== 'read')
      return unavailable(
        `ledger read: ${answer.kind === 'cancelled' ? 'cancelled' : answer.reason}`,
      )
    const output = answer.output
    const revisionText = isObject(output) ? (output['revision'] ?? null) : undefined
    const records = isObject(output) ? recordsOf<B>(output['records']) : null
    const revision = decodeToolRevision(revisionText === null ? '0' : revisionText)
    if (records === null || !('ok' in revision))
      return unavailable('ledger read: the rows do not hold a ledger domain')
    return { kind: 'complete', revision: revision.ok, records }
  }

  const commit = async (input: LedgerCommitInput<B>): Promise<LedgerCommit> => {
    const resolved = await resolveTenant(options, input.domain.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    let writes: readonly LedgerWriteFact[]
    try {
      writes = writesOf(input)
    } catch (error) {
      if (error instanceof NotJsonError) return unavailable(error.message)
      throw error
    }
    const facts: LedgerFacts = {
      ...addressOf(resolved.at.tenant, input.domain),
      intent: 'ledger',
      expected: input.expected,
      revision: input.revision,
      writes,
    }
    return ledgerAnswer(await options.storage.commit(requestOf(options, resolved.at, facts)))
  }

  return { durability: 'durable', read, commit }
}
