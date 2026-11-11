// The durable ToolLedgerStore (G1) over the SQL storage contract. A ledger domain (`call`, `queue`
// or `host`) is a group of rows with its own revision inside the transaction domain of its tenant.
// `read` is one `domain-serial` read; `commit` is one SQL commit whose participant checks the
// expected revision, applies the writes in order and sets the new revision, or writes nothing.
import { randomUUID } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { DomainRef, JsonValue, TenantDomainListing } from '@omne-harness/sql-contract'
import {
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerPendingScan,
  type LedgerPendingScanInput,
  type LedgerRead,
  type LedgerRecord,
  type PendingCall,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { NotJsonError } from './json.ts'
import { addressOf, ledgerAnswer, notJson, unavailable, writesOf } from './ledger-wire.ts'
import type { SqlToolLedgerStoreOptions } from './options.ts'
import { requestOf, resolveTenant, tenantText } from './tenant.ts'
import type {
  LedgerFacts,
  LedgerWriteFact,
  PendingReadInput,
  PendingReadOutput,
} from './worker/facts.ts'
import { LEDGER_READ_HANDLER, PENDING_READ_HANDLER, PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

export type SqlToolLedgerStore<B extends ContentBlock> = ToolLedgerStore<B> &
  Readonly<{
    durability: 'durable'
    scanPending(input: LedgerPendingScanInput): Promise<LedgerPendingScan>
  }>

type Listed = Readonly<{ calls: readonly string[]; more: boolean }>

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

export function createSqlToolLedgerStore<B extends ContentBlock = ContentBlock>(
  options: SqlToolLedgerStoreOptions,
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
      if (error instanceof NotJsonError) return notJson(error)
      throw error
    }
    const facts: LedgerFacts = {
      ...addressOf(resolved.at.tenant, input.domain),
      intent: 'ledger',
      expected: input.expected,
      revision: input.revision,
      writes,
      ...(input.domain.kind === 'call' && input.pending !== undefined
        ? { pending: input.pending }
        : {}),
    }
    return ledgerAnswer(await options.storage.commit(requestOf(options, resolved.at, facts)))
  }

  /** 一个租户事务域里的一页标记。 */
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

  /** 把一个租户的标记行变成调用身份；不合法的身份是存储故障，不是空页。 */
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

  /** 单个租户：在它的事务域里按调用身份分页。 */
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

  /**
   * 跨租户：按租户文本的顺序逐个读已发布目录里的租户事务域。每个域各自读一次，整个扫描不声称是
   * 同一时刻的快照。一个域读不到时整页答复 `unavailable`，不答复更短的页。
   */
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
      if ('kind' in page) return page
      const found = callsOf(parsed.value, page)
      if (found === null) return unavailable('pending read: a row holds no call identity')
      calls.push(...found)
      if (page.more) return { kind: 'page', calls, more: true }
      if (calls.length >= input.limit)
        return { kind: 'page', calls, more: index < entries.length - 1 }
    }
    return { kind: 'page', calls, more: false }
  }

  const scanPending = (input: LedgerPendingScanInput): Promise<LedgerPendingScan> =>
    input.tenant === null ? scanTenants(input) : scanTenant(input)

  return { durability: 'durable', read, commit, scanPending }
}
