// The task table of this run (SPEC S2): keyed by tenant, principal, holding and task id. An entry
// records what the task was started with: the connection generation it was issued at, the peer
// account of the connection (with the tenant and the holding of the key, the connection identity
// without the adoption revision), and the output schema of the action, for the result's output
// check. The key has no peer account, so a task id the peer gives again on another account of the
// same holding lands on the same key: that key is then ambiguous, and stays so (MC-17 step 1).
// Entries stay for the run; the table does not survive a restart (a known limitation).
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EndpointHolding, Generation, PeerAccount, TaskId } from '@omne-harness/mcp-contract'
import { accountTextOf, tenantTextOf } from './text.ts'

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

/** A key two peer accounts answered the same task id on: no reference of it names one task. */
export type Ambiguous = 'ambiguous'

function textOf(key: TaskKey): string {
  return JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.holding, key.taskId])
}

export class TaskTable {
  readonly #entries = new Map<string, TaskRecord | Ambiguous>()

  /**
   * A task the peer answered with, recorded for its initiator. The same account answering the
   * id again (a later generation) replaces the record; another account makes the key ambiguous.
   */
  record(key: TaskKey, task: TaskRecord): void {
    const text = textOf(key)
    const existing = this.#entries.get(text)
    const collides =
      existing !== undefined &&
      (existing === 'ambiguous' || accountTextOf(existing.account) !== accountTextOf(task.account))
    this.#entries.set(text, collides ? 'ambiguous' : task)
  }

  /** The record of a task by its full key; undefined for anyone but the initiator. */
  get(key: TaskKey): TaskRecord | Ambiguous | undefined {
    return this.#entries.get(textOf(key))
  }
}
