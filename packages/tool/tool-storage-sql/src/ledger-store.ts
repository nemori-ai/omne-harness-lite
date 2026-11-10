// The durable ToolLedgerStore (G1) over the SQL storage contract. A ledger domain (`call`, `queue`
// or `host`) is a group of rows with its own revision inside the transaction domain of its tenant.
// `read` is one `domain-serial` read; `commit` is one SQL commit whose participant checks the
// expected revision and the read-set assertions, applies the writes in order and sets the new
// revision, or writes nothing.
import { randomUUID } from 'node:crypto'

import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import {
  recordKey,
  type DueEntry,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerDueRead,
  type LedgerRead,
  type LedgerRecordRead,
  type LedgerRecord,
  type TenantId,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import {
  decodeToolInstant,
  decodeToolRevision,
  type ToolInstant,
} from '@omne-harness/tool-contract/provider'
import { NotJsonError } from './json.ts'
import { keeping, LedgerKeeper } from './ledger-keeper.ts'
import {
  addressOf,
  assertsOf,
  ledgerAnswer,
  notJson,
  sameTenant,
  unavailable,
  writesOf,
} from './ledger-wire.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { requestOf, resolveTenant } from './tenant.ts'
import type { LedgerFacts, LedgerWriteFact } from './worker/facts.ts'
import {
  DUE_READ_ENTRIES,
  DUE_READ_HANDLER,
  LEDGER_READ_HANDLER,
  PROTOCOL,
} from './worker/schema.ts'
import { isObject } from './worker/support.ts'

export type SqlToolLedgerStore = ToolLedgerStore & Readonly<{ durability: 'durable' }>

/** Storage keeps a stored value opaque until Tool checks its format. */
type StoredRecord = Readonly<{ key: string; record: unknown }>

function storedRecordsOf(rows: JsonValue | undefined): StoredRecord[] | null {
  if (!Array.isArray(rows)) return null
  const records: StoredRecord[] = []
  for (const row of rows) {
    if (!isObject(row) || typeof row['key'] !== 'string' || row['record'] === undefined) return null
    records.push({ key: row['key'], record: row['record'] })
  }
  return records
}

/** A row key check before exposing records; the migration baseline keeps old formats out. */
function recordsOf(rows: readonly StoredRecord[]): LedgerRecord[] | null {
  const records: LedgerRecord[] = []
  for (const row of rows) {
    const record = row['record'] as unknown as LedgerRecord
    if (typeof record.kind !== 'string' || recordKey(record) !== row['key']) return null
    records.push(record)
  }
  return records
}

async function readStored(
  options: SqlToolStorageOptions,
  domain: LedgerDomain,
  key: string | null,
) {
  const resolved = await resolveTenant(options, domain.tenant)
  if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
  const answer = await options.storage.read({
    domain: resolved.at.domain,
    handler: LEDGER_READ_HANDLER,
    protocol: PROTOCOL,
    requestKey: randomUUID(),
    input: { ...addressOf(resolved.at.tenant, domain), ...(key === null ? {} : { key }) },
  })
  if (answer.kind !== 'read')
    return unavailable(`ledger read: ${answer.kind === 'cancelled' ? 'cancelled' : answer.reason}`)
  const output = answer.output
  const revisionText = isObject(output) ? (output['revision'] ?? null) : undefined
  const records = isObject(output) ? storedRecordsOf(output['records']) : null
  const revision = decodeToolRevision(revisionText === null ? '0' : revisionText)
  if (records === null || !('ok' in revision))
    return unavailable('ledger read: invalid stored domain')
  return { kind: 'read', revision: revision.ok, rows: records } as const
}

/** A due row as the handler returns it, read back into the port's entry; null when malformed. */
function dueEntryOf(tenant: TenantId, row: JsonValue): DueEntry | null {
  if (!isObject(row)) return null
  const kind = row['kind']
  const name = row['name']
  const key = row['key']
  const dueAt = decodeToolInstant(row['dueAt'])
  if (typeof name !== 'string' || typeof key !== 'string' || !('ok' in dueAt)) return null
  if (kind === 'queue' || kind === 'host')
    return { domain: { kind, tenant, key: name }, key, dueAt: dueAt.ok }
  if (kind !== 'call') return null
  const call = decodeToolCallId(name)
  return 'ok' in call ? { domain: { kind, tenant, call: call.ok }, key, dueAt: dueAt.ok } : null
}

/** The revision of a domain that was never committed (`INITIAL_REVISION` of the ledger). */
const INITIAL_REVISION = '0'

/**
 * One keeper for each storage. Every ledger store of this process over the same storage commits
 * through it, so the stores of the Tool runtime and of the sweep answer reads from one snapshot.
 */
const keepers = new WeakMap<SqlStorage, LedgerKeeper>()

function keeperOf(storage: SqlStorage): LedgerKeeper {
  let keeper = keepers.get(storage)
  if (keeper === undefined) {
    keeper = new LedgerKeeper()
    keepers.set(storage, keeper)
  }
  return keeper
}

export function createSqlToolLedgerStore(options: SqlToolStorageOptions): SqlToolLedgerStore {
  const commit = async (input: LedgerCommitInput): Promise<LedgerCommit> => {
    // The assertion is part of the commit, so the same commit is refused whenever it is sent.
    if (!(input.asserts ?? []).every(assertion => sameTenant(input.domain, assertion.domain)))
      return { kind: 'rejected', reason: 'an assertion names a domain of another tenant' }
    if (
      input.writes.some(write => write.kind === 'drop') &&
      (input.writes.length !== 1 || input.revision !== INITIAL_REVISION)
    )
      return { kind: 'rejected', reason: 'a drop is the only write and names the initial revision' }
    const resolved = await resolveTenant(options, input.domain.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    let writes: readonly LedgerWriteFact[]
    try {
      writes = writesOf(input)
    } catch (error) {
      if (error instanceof NotJsonError) return notJson(error)
      throw error
    }
    const facts: LedgerFacts = {
      ...addressOf(resolved.at.tenant, input.domain),
      intent: 'ledger',
      expected: input.expected,
      revision: input.revision,
      writes,
      asserts: assertsOf(input),
    }
    return ledgerAnswer(await options.storage.commit(requestOf(options, resolved.at, facts)))
  }

  const read = async (domain: LedgerDomain): Promise<LedgerRead> => {
    const answer = await readStored(options, domain, null)
    if (answer.kind !== 'read') return answer
    const records = recordsOf(answer.rows)
    return records === null
      ? unavailable('ledger read: invalid domain or unsupported record format')
      : { kind: 'complete', revision: answer.revision, records }
  }
  const readRecord = async (domain: LedgerDomain, key: string): Promise<LedgerRecordRead> => {
    const answer = await readStored(options, domain, key)
    if (answer.kind !== 'read') return answer
    const records = recordsOf(answer.rows)
    if (records === null || records.length > 1 || (records[0] && recordKey(records[0]) !== key))
      return unavailable('ledger read: invalid record or unsupported record format')
    return { kind: 'complete', revision: answer.revision, record: records[0] ?? null }
  }
  const due = async (tenant: TenantId, now: ToolInstant, limit: number): Promise<LedgerDueRead> => {
    const resolved = await resolveTenant(options, tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    const answer = await options.storage.read({
      domain: resolved.at.domain,
      handler: DUE_READ_HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: { tenant: resolved.at.tenant, now, limit: Math.min(limit, DUE_READ_ENTRIES) },
    })
    if (answer.kind !== 'read')
      return unavailable(`due read: ${answer.kind === 'cancelled' ? 'cancelled' : answer.reason}`)
    const rows = isObject(answer.output) ? answer.output['entries'] : undefined
    if (!Array.isArray(rows)) return unavailable('due read: invalid stored index')
    const entries: DueEntry[] = []
    for (const row of rows) {
      const entry = dueEntryOf(tenant, row)
      if (entry === null) return unavailable('due read: invalid stored entry')
      entries.push(entry)
    }
    return { kind: 'complete', entries }
  }
  const kept = keeping(keeperOf(options.storage), { read, readRecord, commit }, () =>
    /* wall-clock: operation-timing -- The age of a snapshot is a monotonic duration since the storage confirmed it (SPEC TS-16). */ performance.now(),
  )
  return { durability: 'durable', ...kept, due }
}
