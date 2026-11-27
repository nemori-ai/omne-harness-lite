import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ActionCatalogRecord, CatalogKey, PeerAccount } from '@omne-harness/mcp-contract'
import type {
  CatalogStore,
  ContinuationRecords,
  TaskRecords,
  TaskRow,
  TaskRowKey,
} from '@omne-harness/mcp-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import {
  HANDLER,
  PARTICIPANT,
  PROTOCOL,
  type CatalogRowKey,
  type ReadName,
  type ScriptName,
  type TaskRowCells,
} from './schema.ts'

/** Where one tenant's MCP facts are stored, and under which storage combination. */
export type TenantBinding = Readonly<{
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
}>

export type McpSqlOptions = Readonly<{
  storage: SqlStorage
  /** The binding of a tenant now, by its text. Null: the tenant has no storage domain. */
  bind(tenant: string): Promise<TenantBinding | null>
}>

type Committed = Readonly<{ kind: 'answer'; response: unknown }> | Readonly<{ kind: 'unknown' }>

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

function tenantText(key: Pick<CatalogKey, 'tenant'>): string {
  const encoded = tenantCodec.encode(key.tenant)
  if (!encoded.ok) throw new TypeError('the tenant did not come from legal-identity')
  return encoded.value
}

const accountText = (account: PeerAccount): string =>
  account.kind === 'anonymous' ? 'anonymous' : `credential:${account.binding}`

function rowKeyOf(key: CatalogKey): CatalogRowKey {
  return {
    tenant: tenantText(key),
    account: accountText(key.account),
    holding: key.holding,
    kind: 'actions',
  }
}

const taskCellsOf = (key: TaskRowKey): TaskRowCells => ({
  tenant: tenantText(key),
  principal: key.principalKey,
  holding: key.holding,
  task: key.taskId,
})

const scopeOf = (tenant: string) => ({ kind: 'tenant', tenant }) as const

function committer(options: McpSqlOptions) {
  return async function commit(
    tenant: string,
    script: ScriptName,
    command: unknown,
  ): Promise<Committed | null> {
    const binding = await options.bind(tenant)
    if (binding === null) return null
    const { transactionDomain, combinationVersion, manifestDigest } = binding
    const result = await options.storage.commit({
      identity: {
        scope: scopeOf(tenant),
        transactionDomain,
        operation: `mcp.${script}`,
        protocolVersion: '2',
        operationKey: randomUUID(),
        recall: 'never',
      },
      combinationVersion,
      manifestDigest,
      commands: [{ participant: PARTICIPANT, facts: { script, command: json(command) } }],
    })
    if (result.kind === 'unknown') return { kind: 'unknown' }
    if (result.kind !== 'committed') return null
    return { kind: 'answer', response: result.responses[0].reply.response }
  }
}

/** The continuation records over SQL; a commit whose outcome is not known marks nothing, so nothing is sent on it. */
export function createSqlContinuationRecords(options: McpSqlOptions): ContinuationRecords {
  const commit = committer(options)
  return {
    async mark(key) {
      try {
        const tenant = tenantText(key)
        const done = await commit(tenant, 'markContinuation', {
          tenant,
          checkpoint: key.checkpoint,
        })
        if (done === null || done.kind === 'unknown') return fail('unavailable')
        const answer = (done.response as { ok?: unknown }).ok
        return answer === 'marked' || answer === 'already' ? succeed(answer) : fail('unavailable')
      } catch {
        return fail('unavailable')
      }
    },
  }
}

function reader(options: McpSqlOptions) {
  return async function read(
    tenant: string,
    name: ReadName,
    request: Readonly<Record<string, unknown>>,
  ): Promise<{ ok: unknown } | null> {
    const binding = await options.bind(tenant)
    if (binding === null) return null
    const requestKey = randomUUID()
    const result = await options.storage.read({
      domain: { scope: scopeOf(tenant), transactionDomain: binding.transactionDomain },
      handler: HANDLER,
      protocol: PROTOCOL,
      requestKey,
      input: json({ read: name, ...request }),
    })
    if (result.kind !== 'read' || result.requestKey !== requestKey) return null
    return result.output as { ok: unknown }
  }
}

/** The task table over SQL; a move whose commit is not known counts when the row now stands at the step it moved to. */
export function createSqlTaskRecords(options: McpSqlOptions): TaskRecords {
  const commit = committer(options)
  const readOf = reader(options)
  const guarded = async <T>(work: () => Promise<T | null>) => {
    try {
      const done = await work()
      return done === null ? fail('unavailable' as const) : succeed(done)
    } catch {
      return fail('unavailable' as const)
    }
  }
  const read: TaskRecords['read'] = key =>
    guarded(async () => {
      const cells = taskCellsOf(key)
      const found = await readOf(cells.tenant, 'readTask', { key: cells })
      if (found === null) return null
      return found.ok === 'absent' || found.ok === 'ambiguous' ? found.ok : (found.ok as TaskRow)
    })
  return {
    read,
    record: (key, row) =>
      guarded(async () => {
        const cells = taskCellsOf(key)
        const command = { key: cells, account: accountText(row.account), row }
        const done = await commit(cells.tenant, 'recordTask', command)
        if (done?.kind === 'answer') return 'recorded' as const
        if (done === null) return null
        const now = await read(key)
        return 'ok' in now && now.ok !== 'absent' ? ('recorded' as const) : null
      }),
    move: (key, from, to) =>
      guarded(async () => {
        const cells = taskCellsOf(key)
        const done = await commit(cells.tenant, 'moveTask', { key: cells, from, to })
        if (done === null) return null
        if (done.kind === 'answer') {
          const answer = (done.response as { ok?: unknown }).ok
          return answer === 'moved' || answer === 'stale' ? answer : null
        }
        const now = await read(key)
        const row = 'ok' in now && typeof now.ok === 'object' ? now.ok : undefined
        return row?.state === to.state && row.round === to.round ? ('moved' as const) : null
      }),
    following: tenant =>
      guarded(async () => {
        const text = tenantText({ tenant })
        const found = await readOf(text, 'followingTasks', { tenant: text })
        if (found === null || !Array.isArray(found.ok)) return null
        return (found.ok as readonly Readonly<Record<string, unknown>>[]).map(item => ({
          key: {
            tenant,
            principalKey: String(item['principal']),
            holding: item['holding'] as TaskRowKey['holding'],
            taskId: item['task'] as TaskRowKey['taskId'],
          },
          row: item['row'] as TaskRow,
        }))
      }),
  }
}

/** The catalog store over SQL, one storage domain per tenant; every read carries the tenant. */
export function createSqlCatalogStore(options: McpSqlOptions): CatalogStore {
  const commit = committer(options)
  const readOf = reader(options)
  const readRow = (key: CatalogRowKey) => readOf(key.tenant, 'readCatalog', { key })

  const read: CatalogStore['read'] = async key => {
    try {
      const found = await readRow(rowKeyOf(key))
      if (found === null) return fail('unavailable')
      return found.ok === 'absent' ? succeed('absent') : succeed(found.ok as ActionCatalogRecord)
    } catch {
      return fail('unavailable')
    }
  }

  return {
    read,
    async write(key, record, expected) {
      try {
        const rowKey = rowKeyOf(key)
        const command = { key: rowKey, revision: record.revision, record, expected }
        const done = await commit(rowKey.tenant, 'writeCatalog', command)
        if (done === null) return fail('unavailable')
        if (done.kind === 'answer')
          return (done.response as { ok?: unknown }).ok === 'written'
            ? succeed(true)
            : fail('revision-conflict')
        // Not known whether it landed: it did when the row now holds this revision.
        const now = await read(key)
        return 'ok' in now && now.ok !== 'absent' && now.ok.revision === record.revision
          ? succeed(true)
          : fail('unavailable')
      } catch {
        return fail('unavailable')
      }
    },
  }
}
