import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ActionCatalogRecord, CatalogKey } from '@omne-harness/mcp-contract'
import type { CatalogStore } from '@omne-harness/mcp-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import { HANDLER, PARTICIPANT, PROTOCOL, type CatalogRowKey, type ScriptName } from './schema.ts'

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

function tenantText(key: CatalogKey): string {
  const encoded = tenantCodec.encode(key.tenant)
  if (!encoded.ok) throw new TypeError('the tenant did not come from legal-identity')
  return encoded.value
}

function rowKeyOf(key: CatalogKey): CatalogRowKey {
  const account =
    key.account.kind === 'anonymous' ? 'anonymous' : `credential:${key.account.binding}`
  return { tenant: tenantText(key), account, holding: key.holding, kind: 'actions' }
}

/** The catalog store over SQL, one storage domain per tenant; every read carries the tenant. */
export function createSqlCatalogStore(options: McpSqlOptions): CatalogStore {
  const scopeOf = (tenant: string) => ({ kind: 'tenant', tenant }) as const

  async function commit(
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

  async function readRow(key: CatalogRowKey): Promise<{ ok: unknown } | null> {
    const binding = await options.bind(key.tenant)
    if (binding === null) return null
    const requestKey = randomUUID()
    const result = await options.storage.read({
      domain: { scope: scopeOf(key.tenant), transactionDomain: binding.transactionDomain },
      handler: HANDLER,
      protocol: PROTOCOL,
      requestKey,
      input: json({ read: 'readCatalog', key }),
    })
    if (result.kind !== 'read' || result.requestKey !== requestKey) return null
    return result.output as { ok: unknown }
  }

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
