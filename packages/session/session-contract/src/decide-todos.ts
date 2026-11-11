import type { DurableEvidence, TodoItemId } from './identity.ts'
import type { WorkSnapshot } from './values.ts'
import type { Decision } from './judgments.ts'
import type { SessionCommand } from './ports.ts'
import { encodeEntry } from './entries.ts'
import { digestOf } from './operations.ts'
import { tenantText } from './initialization-plan.ts'
import { validTodoText } from './todos.ts'

export function decideTodos(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'addTodo' | 'removeTodo' | 'markTodoComplete' }>,
  source: DurableEvidence,
): Decision {
  if (snapshot.lifecycle === 'archived') return { kind: 'rejected', failure: { kind: 'archived' } }
  if (snapshot.frozen !== null)
    return { kind: 'rejected', failure: { kind: 'frozen', verdict: snapshot.frozen } }
  if (snapshot.lifecycle === 'initializing')
    return { kind: 'rejected', failure: { kind: 'not-ready' } }
  const origin = { owner: 'session', via: 'direct', source } as const
  if (command.kind === 'addTodo') {
    if (!validTodoText(command.input.text))
      return {
        kind: 'rejected',
        failure: {
          kind: 'invalid',
          field: 'text',
          reason: 'expected nonblank text of at most 4096 UTF-8 bytes',
        },
      }
    const item =
      `todo_${digestOf(['todo-item/1', tenantText(snapshot.tenant), snapshot.session, command.input.operation])}` as TodoItemId
    return {
      kind: 'entries',
      entries: [
        encodeEntry({ kind: 'session.todo-added', item, text: command.input.text }, origin),
      ],
    }
  }
  const item = snapshot.todos?.find(
    todo => todo.id === command.input.item && todo.status !== 'removed',
  )
  if (item === undefined)
    return { kind: 'rejected', failure: { kind: 'todo-not-found', item: command.input.item } }
  return {
    kind: 'entries',
    entries: [
      encodeEntry(
        {
          kind: command.kind === 'removeTodo' ? 'session.todo-removed' : 'session.todo-completed',
          item: item.id,
        },
        origin,
      ),
    ],
  }
}
