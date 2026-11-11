import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

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

/** Each method uses the host's fixed call identity and current Session access. */
export interface BoundTodoItems {
  add(input: Readonly<{ text: string }>): Promise<TodoAuthorReply>
  remove(input: Readonly<{ item: string }>): Promise<TodoAuthorReply>
  markComplete(input: Readonly<{ item: string }>): Promise<TodoAuthorReply>
  list(input: Readonly<{ after: TodoAuthorCursor | null; limit: number }>): Promise<TodoAuthorReply>
}
const attachments = new WeakMap<ToolExecutionContext, BoundTodoItems>()
export function todoItemsOf(context: ToolExecutionContext): BoundTodoItems | undefined {
  return attachments.get(context)
}

/** Attach after other context-producing attachments. Finish removes access before delegation. */
export function attachTodoItems(
  scope: ToolExecutionScope,
  value: BoundTodoItems,
): ToolExecutionScope {
  const context = scope.context
  attachments.set(context, value)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      attachments.delete(context)
      const completion = Promise.withResolvers<Awaited<ReturnType<ToolExecutionScope['finish']>>>()
      finished = completion.promise
      try {
        completion.resolve(scope.finish(exit))
      } catch (error) {
        completion.reject(error)
      }
      return finished
    },
  }
}
