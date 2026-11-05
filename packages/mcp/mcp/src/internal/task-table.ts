// The task table of this run (SPEC S2): keyed by tenant, principal, holding and task id. An entry
// records what the task was started with: the connection generation it was issued at, the peer
// account of the connection (with the tenant and the holding of the key, the connection identity
// without the adoption revision), and the output schema of the action, for the result's output
// check. Entries stay for the run; the table does not survive a restart (a known limitation).
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EndpointHolding, Generation, PeerAccount, TaskId } from '@omne-harness/mcp-contract'
import { tenantTextOf } from './text.ts'

export type TaskKey = Readonly<{
  tenant: TenantId
  /** The text of the principal, from `McpConfig.principalKey`. */
  principalKey: string
  holding: EndpointHolding
  taskId: TaskId
}>

export type TaskRecord = Readonly<{
  issuedAt: Generation
  account: PeerAccount
  outputSchema?: JsonValue
}>

function textOf(key: TaskKey): string {
  return JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.holding, key.taskId])
}

export class TaskTable {
  readonly #entries = new Map<string, TaskRecord>()

  /** A task the peer answered with, recorded for its initiator. */
  record(key: TaskKey, task: TaskRecord): void {
    this.#entries.set(textOf(key), task)
  }

  /** The record of a task by its full key; undefined for anyone but the initiator. */
  get(key: TaskKey): TaskRecord | undefined {
    return this.#entries.get(textOf(key))
  }
}
