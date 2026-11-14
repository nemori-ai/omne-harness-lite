import { randomUUID } from 'node:crypto'

import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  DomainRef,
  FactCommandV2,
  JsonValue,
  SqlStorage,
  TenantDomainListing,
} from '@omne-harness/sql-contract'
import {
  recordKey,
  type DueEntry,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerDueRead,
  type LedgerPendingScan,
  type LedgerPendingScanInput,
  type LedgerRead,
  type LedgerRecordRead,
  type LedgerRecord,
  type PendingCall,
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
  joined,
  lacksFixed,
  ledgerAnswer,
  notJson,
  sameTenant,
  type CommitAnswer,
  type FixedMode,
  unavailable,
  writesOf,
} from './ledger-wire.ts'
import type { SqlToolLedgerStoreOptions, SqlToolStorageOptions } from './options.ts'
import { requestOf, resolveTenant, tenantText } from './tenant.ts'
import type { LedgerFacts, PendingReadInput, PendingReadOutput } from './worker/facts.ts'
import {
  DUE_READ_ENTRIES,
  DUE_READ_HANDLER,
  LEDGER_READ_HANDLER,
  PENDING_READ_HANDLER,
  PROTOCOL,
} from './worker/schema.ts'
import { isObject } from './worker/support.ts'

export type SqlToolLedgerStore = ToolLedgerStore & Readonly<{ durability: 'durable' }>

type Listed = Readonly<{ calls: readonly string[]; more: boolean }>

type StoredRecord = Readonly<{ key: string; record: unknown }>

function storedRecordsOf(rows: JsonValue | undefined): StoredRecord[] | null {
  if (!Array.isArray(rows)) return null
  const records: StoredRecord[] = []
  for (const row of rows) {
    if (!isObject(row) || typeof row['key'] !== 'string' || row['record'] === undefined) return null
    records.push({ key: row['key'], record: joined(row['record'], row['fixed']) })
  }
  return records
}

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

const INITIAL_REVISION = '0'

const keepers = new WeakMap<object, LedgerKeeper>()

function keeperOf(storage: SqlStorage): LedgerKeeper {
  const { database } = storage
  let keeper = keepers.get(database)
  if (keeper === undefined) {
    keeper = new LedgerKeeper()
    keepers.set(database, keeper)
  }
  return keeper
}

export type LedgerCommitCondition = Readonly<{
  combinationVersion: string
  manifestDigest: string
  commands: readonly FactCommandV2[]
}>

function ledgerCommitOver(
  options: SqlToolStorageOptions,
  condition?: LedgerCommitCondition,
  answerOf: (answer: CommitAnswer) => LedgerCommit = ledgerAnswer,
) {
  return async (input: LedgerCommitInput): Promise<LedgerCommit> => {
    if (!(input.asserts ?? []).every(assertion => sameTenant(input.domain, assertion.domain)))
      return { kind: 'rejected', reason: 'an assertion names a domain of another tenant' }
    if (
      input.writes.some(write => write.kind === 'drop') &&
      (input.writes.length !== 1 || input.revision !== INITIAL_REVISION)
    )
      return { kind: 'rejected', reason: 'a drop is the only write and names the initial revision' }
    const resolved = await resolveTenant(options, input.domain.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    const sent = (fixed: FixedMode) => {
      const facts: LedgerFacts = {
        ...addressOf(resolved.at.tenant, input.domain),
        intent: 'ledger',
        expected: input.expected,
        revision: input.revision,
        writes: writesOf(input, fixed),
        asserts: assertsOf(input),
        ...(input.domain.kind === 'call' && input.pending !== undefined
          ? { pending: input.pending }
          : {}),
      }
      const request = requestOf(options, resolved.at, facts)
      return options.storage.commit(
        condition === undefined
          ? request
          : {
              ...request,
              combinationVersion: condition.combinationVersion,
              manifestDigest: condition.manifestDigest,
              commands: [...condition.commands, ...request.commands],
            },
      )
    }
    try {
      const answer = await sent(input.expected === INITIAL_REVISION ? 'given' : 'kept')
      return answerOf(lacksFixed(answer) ? await sent('given') : answer)
    } catch (error) {
      if (error instanceof NotJsonError) return notJson(error)
      throw error
    }
  }
}

export function conditionalLedgerCommit(
  options: SqlToolStorageOptions,
  condition: LedgerCommitCondition,
  answerOf: (answer: CommitAnswer) => LedgerCommit,
): (input: LedgerCommitInput) => Promise<LedgerCommit> {
  return storeOver(options, ledgerCommitOver(options, condition, answerOf)).commit
}

export function createSqlToolLedgerStore(options: SqlToolLedgerStoreOptions): SqlToolLedgerStore {
  return { ...storeOver(options, ledgerCommitOver(options)), scanPending: pendingScanOver(options) }
}

function storeOver(
  options: SqlToolStorageOptions,
  commit: (input: LedgerCommitInput) => Promise<LedgerCommit>,
): Omit<SqlToolLedgerStore, 'scanPending'> {
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
  const kept = keeping(keeperOf(options.storage), { read, readRecord, commit })
  return { durability: 'durable', ...kept, due }
}

function pendingScanOver(
  options: SqlToolLedgerStoreOptions,
): (input: LedgerPendingScanInput) => Promise<LedgerPendingScan> {
  const readPending = async (
    domain: DomainRef,
    input: PendingReadInput,
  ): Promise<Listed | LedgerPendingScan> => {
    const answer = await options.storage.read({
      domain,
      handler: PENDING_READ_HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input,
    })
    if (answer.kind !== 'read')
      return unavailable(
        `pending read: ${answer.kind === 'cancelled' ? 'cancelled' : answer.reason}`,
      )
    const output = answer.output
    const calls = isObject(output) ? output['calls'] : undefined
    const more = isObject(output) ? output['more'] : undefined
    if (
      !Array.isArray(calls) ||
      !calls.every(call => typeof call === 'string') ||
      typeof more !== 'boolean'
    )
      return unavailable('pending read: the rows do not hold a pending page')
    return { calls, more } satisfies PendingReadOutput
  }

  const callsOf = (
    tenant: PendingCall['tenant'],
    listed: Listed,
  ): readonly PendingCall[] | null => {
    const calls: PendingCall[] = []
    for (const text of listed.calls) {
      const call = decodeToolCallId(text)
      if (!('ok' in call)) return null
      calls.push({ tenant, call: call.ok })
    }
    return calls
  }

  const scanTenant = async (input: LedgerPendingScanInput): Promise<LedgerPendingScan> => {
    if (input.tenant === null) return unavailable('not a legal tenant')
    const resolved = await resolveTenant(options, input.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    const after =
      input.after === null || tenantText(input.after.tenant) !== resolved.at.tenant
        ? null
        : input.after.call
    if (input.after !== null && after === null)
      return unavailable('the scan cursor names another tenant')
    const listed = await readPending(resolved.at.domain, {
      tenant: resolved.at.tenant,
      after,
      limit: input.limit,
    })
    if ('kind' in listed) return listed
    const calls = callsOf(input.tenant, listed)
    if (calls === null) return unavailable('pending read: a row holds no call identity')
    return { kind: 'page', calls, more: listed.more }
  }

  const scanTenants = async (input: LedgerPendingScanInput): Promise<LedgerPendingScan> => {
    let listed: TenantDomainListing
    try {
      listed = await options.tenants()
    } catch {
      return unavailable('tenant directory: the listing threw')
    }
    if (listed.kind === 'denied') return unavailable('tenant directory: the listing was denied')
    if (listed.kind !== 'ready') return unavailable(`tenant directory: ${listed.diagnostic}`)
    const from =
      input.after === null
        ? null
        : { tenant: tenantText(input.after.tenant), call: input.after.call }
    if (from !== null && from.tenant === null) return unavailable('not a legal tenant')
    const entries = [...listed.entries]
      .filter(entry => from === null || entry.tenant >= (from.tenant as string))
      .sort((a, b) => (a.tenant < b.tenant ? -1 : a.tenant > b.tenant ? 1 : 0))
    const calls: PendingCall[] = []
    for (const [index, entry] of entries.entries()) {
      const parsed = tenantCodec.parse(entry.tenant)
      if (
        !parsed.ok ||
        entry.domain.scope.kind !== 'tenant' ||
        entry.domain.scope.tenant !== entry.tenant
      )
        return unavailable('the tenant domain directory holds an entry of no tenant')
      const page = await readPending(entry.domain, {
        tenant: entry.tenant,
        after: from !== null && from.tenant === entry.tenant ? from.call : null,
        limit: input.limit - calls.length,
      })
      if ('kind' in page)
        return page.kind === 'unavailable'
          ? unavailable(`tenant ${entry.tenant}: ${page.diagnostic}`)
          : page
      const found = callsOf(parsed.value, page)
      if (found === null)
        return unavailable(`tenant ${entry.tenant}: pending read: a row holds no call identity`)
      calls.push(...found)
      if (page.more) return { kind: 'page', calls, more: true }
      if (calls.length >= input.limit)
        return { kind: 'page', calls, more: index < entries.length - 1 }
    }
    return { kind: 'page', calls, more: false }
  }

  return input => (input.tenant === null ? scanTenants(input) : scanTenant(input))
}
