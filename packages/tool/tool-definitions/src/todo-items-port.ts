import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { contextPort } from './context-port.ts'

export type TodoAuthorEvidence = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>
export type TodoAuthorItem = Readonly<{
  id: string
  text: string
  status: 'pending' | 'completed' | 'removed'
  createdAt: string
  changedAt: string
}>
export type TodoAuthorMutationReceipt = Readonly<{
  receipt: Readonly<{
    operation: string
    revision: string
    first: string
    last: string
    recovered: boolean
    source: TodoAuthorEvidence
  }>
  item: TodoAuthorItem
}>
export type TodoAuthorCursor = Readonly<{
  tenant: string
  session: string
  revision: string
  after: string
}>
export type TodoAuthorPage = Readonly<{
  revision: string
  items: readonly (TodoAuthorItem & Readonly<{ status: 'pending' | 'completed' }>)[]
  next: TodoAuthorCursor | null
}>
export type TodoAuthorFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'todo-not-found'; item: string }>
  | Readonly<{ kind: 'conflict' | 'commit-unknown'; operation: string }>
  | Readonly<{ kind: 'changed'; revision: string }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
  | Readonly<{
      kind: 'frozen'
      verdict: Readonly<{ cause: 'tool-shape-lost'; evidence: TodoAuthorEvidence }> | null
    }>
  | Readonly<{ kind: 'archived' | 'not-ready' }>
export type TodoAuthorReply =
  | Readonly<{ ok: TodoAuthorMutationReceipt | TodoAuthorPage }>
  | Readonly<{ failure: TodoAuthorFailure }>

export interface BoundTodoItems {
  add(input: Readonly<{ text: string }>): Promise<TodoAuthorReply>
  remove(input: Readonly<{ item: string }>): Promise<TodoAuthorReply>
  markComplete(input: Readonly<{ item: string }>): Promise<TodoAuthorReply>
  list(input: Readonly<{ after: TodoAuthorCursor | null; limit: number }>): Promise<TodoAuthorReply>
}
const port = contextPort<BoundTodoItems>()
export function todoItemsOf(context: ToolExecutionContext): BoundTodoItems | undefined {
  return port.of(context)
}

export function attachTodoItems(
  scope: ToolExecutionScope,
  value: BoundTodoItems,
): ToolExecutionScope {
  return port.attach(scope, value)
}
