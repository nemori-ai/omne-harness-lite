import type { CommitReceipt, SessionWork } from './faces.ts'
import type { SessionId, SessionRevision, TodoItemId } from './identity.ts'

export type TodoItem = Readonly<{
  id: TodoItemId
  text: string
  status: 'pending' | 'completed' | 'removed'
  createdAt: SessionRevision
  changedAt: SessionRevision
}>
export type VisibleTodoItem = TodoItem & Readonly<{ status: 'pending' | 'completed' }>
export type TodoMutationReceipt = Readonly<{ receipt: CommitReceipt; item: TodoItem }>
export type TodoPageCursor = Readonly<{
  tenant: string
  session: SessionId
  revision: SessionRevision
  after: TodoItemId
}>
export type TodoPage = Readonly<{
  revision: SessionRevision
  items: readonly VisibleTodoItem[]
  next: TodoPageCursor | null
}>
export type SessionTodos<P> = Pick<
  SessionWork<P>,
  'addTodo' | 'removeTodo' | 'markTodoComplete' | 'listTodos'
>

/** The same bound applies to commands and to replayed log payloads. */
export function validTodoText(text: unknown): text is string {
  return (
    typeof text === 'string' && text.trim().length > 0 && Buffer.byteLength(text, 'utf8') <= 4096
  )
}
