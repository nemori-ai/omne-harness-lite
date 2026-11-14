import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EndpointHolding, Generation, PeerAccount, TaskId } from '@omne-harness/mcp-contract'
import { accountTextOf, tenantTextOf } from './text.ts'

export type TaskKey = Readonly<{
  tenant: TenantId
  principalKey: string
  holding: EndpointHolding
  taskId: TaskId
}>

export type TaskRecord = Readonly<{
  issuedAt: Generation
  account: PeerAccount
  outputSchema?: JsonValue
}>

type Ambiguous = 'ambiguous'

function textOf(key: TaskKey): string {
  return JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.holding, key.taskId])
}

export class TaskTable {
  readonly #entries = new Map<string, TaskRecord | Ambiguous>()

  record(key: TaskKey, task: TaskRecord): void {
    const text = textOf(key)
    const existing = this.#entries.get(text)
    const collides =
      existing !== undefined &&
      (existing === 'ambiguous' || accountTextOf(existing.account) !== accountTextOf(task.account))
    this.#entries.set(text, collides ? 'ambiguous' : task)
  }

  get(key: TaskKey): TaskRecord | undefined {
    const entry = this.#entries.get(textOf(key))
    return entry === 'ambiguous' ? undefined : entry
  }
}
