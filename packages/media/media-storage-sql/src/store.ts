import { randomUUID } from 'node:crypto'
import type { MediaIndex, PortFailure } from '@omne-harness/media-contract'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import { HANDLER, PARTICIPANT, PROTOCOL, type ReadRequest, type ScriptName } from './schema.ts'

/** Where one tenant's media metadata is stored, and under which storage combination. */
export type TenantBinding = Readonly<{
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
}>

export type MediaSqlOptions = Readonly<{
  storage: SqlStorage
  /** The binding of a tenant now. Null: the tenant has no storage domain to write to. */
  bind(tenant: string): Promise<TenantBinding | null>
}>

type Reply<T> = Promise<Outcome<T, PortFailure>>
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue
const unavailable = (diagnostic: string) => fail({ kind: 'unavailable' as const, diagnostic })
const unknown = (diagnostic: string) => fail({ kind: 'unknown' as const, diagnostic })

/** The index over SQL, one storage domain per tenant. A commit is not recalled: every script carries its own condition. */
export function createSqlMediaIndex(options: MediaSqlOptions): MediaIndex {
  const scopeOf = (tenant: string) => ({ kind: 'tenant', tenant }) as const

  async function commit<T>(tenant: string, script: ScriptName, command: unknown): Reply<T> {
    try {
      const binding = await options.bind(tenant)
      if (binding === null) return unavailable('the tenant has no storage domain')
      const { transactionDomain, combinationVersion, manifestDigest } = binding
      const result = await options.storage.commit({
        identity: {
          scope: scopeOf(tenant),
          transactionDomain,
          operation: `media.${script}`,
          protocolVersion: '2',
          operationKey: randomUUID(),
          recall: 'never',
        },
        combinationVersion,
        manifestDigest,
        commands: [{ participant: PARTICIPANT, facts: { script, command: json(command) } }],
      })
      if (result.kind === 'unknown') return unknown(`media.${script} has no known result`)
      if (result.kind !== 'committed') return unavailable(`media.${script} ${result.kind}`)
      return result.responses[0].reply.response as Outcome<T, PortFailure>
    } catch (error) {
      return unknown(String(error))
    }
  }

  async function read<T>(tenant: string, request: ReadRequest): Reply<T> {
    try {
      const binding = await options.bind(tenant)
      if (binding === null) return unavailable('the tenant has no storage domain')
      const requestKey = randomUUID()
      const result = await options.storage.read({
        domain: { scope: scopeOf(tenant), transactionDomain: binding.transactionDomain },
        handler: HANDLER,
        protocol: PROTOCOL,
        requestKey,
        input: json(request),
      })
      if (result.kind !== 'read' || result.requestKey !== requestKey)
        return unavailable(`media.${request.read} ${result.kind}`)
      return result.output as Outcome<T, PortFailure>
    } catch (error) {
      return unavailable(String(error))
    }
  }

  return {
    insertUploading: row => commit(row.tenant, 'insertUploading', row),
    attachWrite: (tenant, key, write) => commit(tenant, 'attachWrite', { key, write }),
    readUpload: (tenant, upload) => read(tenant, { read: 'readUpload', name: upload, limit: 1 }),
    advance: input => commit(input.tenant, 'advance', input),
    stageOrMerge: staging => commit(staging.tenant, 'stageOrMerge', staging),
    holdIfLive: input => commit(input.tenant, 'holdIfLive', input),
    readLive: (key, tenant) => read(tenant, { read: 'readLive', name: key, limit: 1 }),
    markDeleting: (tenant, key) => commit(tenant, 'markDeleting', { key }),
    markDeletingIfExpired: input => commit(input.tenant, 'markDeletingIfExpired', input),
    listDeleting: (tenant, limit) => read(tenant, { read: 'listDeleting', name: '', limit }),
    dropRow: (tenant, key) => commit(tenant, 'dropRow', { key }),
    recordRepresentation: input => commit(input.tenant, 'recordRepresentation', input),
    readRepresentation: ({ tenant, key, definition }) =>
      read(tenant, { read: 'readRepresentation', name: key, limit: 1, definition }),
  }
}
