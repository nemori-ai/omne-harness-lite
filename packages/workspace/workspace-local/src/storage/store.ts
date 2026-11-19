import { randomUUID } from 'node:crypto'
import type { StoreAnswer, StoreRead, WorkspaceStore } from '@omne-harness/workspace'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { ReadName } from './read.ts'
import { DOMAIN, HANDLER, PARTICIPANT, PROTOCOL, type ScriptName } from './schema.ts'

/** The storage combination the workspace domain is registered under. */
export type WorkspaceBinding = Readonly<{ combinationVersion: string; manifestDigest: string }>

export type WorkspaceSqlOptions = Readonly<{
  storage: SqlStorage
  /** The binding now. Null: the domain cannot be written to. */
  bind(): Promise<WorkspaceBinding | null>
}>

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

/** The repository over SQL. The storage does not recall a commit: each script is idempotent on its own operation records. */
export function createSqlWorkspaceStore(options: WorkspaceSqlOptions): WorkspaceStore {
  async function commit<T>(script: ScriptName, command: unknown): Promise<StoreAnswer<T>> {
    try {
      const binding = await options.bind()
      if (binding === null) return { kind: 'rolled-back' }
      const result = await options.storage.commit({
        identity: {
          ...DOMAIN,
          operation: `workspace.${script}`,
          protocolVersion: '2',
          operationKey: randomUUID(),
          recall: 'never',
        },
        ...binding,
        commands: [{ participant: PARTICIPANT, facts: { script, command: json(command) } }],
      })
      if (result.kind === 'unknown') return { kind: 'unknown' }
      if (result.kind !== 'committed') return { kind: 'rolled-back' }
      return { kind: 'committed', value: result.responses[0].reply.response as T }
    } catch {
      return { kind: 'unknown' }
    }
  }

  async function read<T>(name: ReadName, ...args: string[]): Promise<StoreRead<T>> {
    try {
      if ((await options.bind()) === null) return { kind: 'unavailable' }
      const requestKey = randomUUID()
      const result = await options.storage.read({
        domain: DOMAIN,
        handler: HANDLER,
        protocol: PROTOCOL,
        requestKey,
        input: { read: name, args },
      })
      if (result.kind !== 'read' || result.requestKey !== requestKey) return { kind: 'unavailable' }
      return { kind: 'read', value: result.output as T }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  return {
    register: command => commit('register', command),
    associate: command => commit('associate', command),
    dissociate: command => commit('dissociate', command),
    state: (tenant, workspace) => read('state', tenant, workspace),
    memberships: tenant => read('memberships', tenant),
    operation: (tenant, operation) => read('operation', tenant, operation),
  }
}
