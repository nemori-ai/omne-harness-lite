// The durable ToolLedgerStore (G1) over the SQL storage contract. A ledger domain (`call`, `queue`
// or `host`) is a group of rows with its own revision inside the transaction domain of its tenant.
// `read` is one `domain-serial` read; `commit` is one SQL commit whose participant checks the
// expected revision, applies the writes in order and sets the new revision, or writes nothing.
import { randomUUID } from 'node:crypto'

import type { JsonValue } from '@omne-harness/sql-contract'
import {
  hasCurrentToolLedgerRecordFormat,
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRead,
  type LedgerRecord,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { NotJsonError } from './json.ts'
import { addressOf, ledgerAnswer, unavailable, writesOf } from './ledger-wire.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { requestOf, resolveTenant } from './tenant.ts'
import type { LedgerFacts, LedgerWriteFact } from './worker/facts.ts'
import { LEDGER_READ_HANDLER, PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

export type SqlToolLedgerStore = ToolLedgerStore & Readonly<{ durability: 'durable' }>

/**
 * Tool owns the format boundary. SQL checks it and the row key before exposing records.
 */
function recordsOf(rows: JsonValue | undefined): LedgerRecord[] | null {
  if (!Array.isArray(rows)) return null
  const records: LedgerRecord[] = []
  for (const row of rows) {
    if (!isObject(row) || typeof row['key'] !== 'string' || !isObject(row['record'])) return null
    if (!hasCurrentToolLedgerRecordFormat(row['record'])) return null
    // This is a format and key check, not a full validation of each record's fields.
    const record = row['record'] as unknown as LedgerRecord
    if (typeof record.kind !== 'string' || recordKey(record) !== row['key']) return null
    records.push(record)
  }
  return records
}

export function createSqlToolLedgerStore(options: SqlToolStorageOptions): SqlToolLedgerStore {
  const read = async (domain: LedgerDomain): Promise<LedgerRead> => {
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
    const records = isObject(output) ? recordsOf(output['records']) : null
    const revision = decodeToolRevision(revisionText === null ? '0' : revisionText)
    if (records === null || !('ok' in revision))
      return unavailable('ledger read: invalid domain or unsupported record format')
    return { kind: 'complete', revision: revision.ok, records }
  }

  const commit = async (input: LedgerCommitInput): Promise<LedgerCommit> => {
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
