import type { SessionEntry } from './entries.ts'
import type { WorkSnapshot } from './values.ts'
import { validTodoText } from './todos.ts'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }

export function applyTodo(
  draft: Draft,
  entry: Extract<
    SessionEntry,
    { kind: 'session.todo-added' | 'session.todo-completed' | 'session.todo-removed' }
  >,
  revision: WorkSnapshot['revision'],
): string | null {
  if (typeof entry.item !== 'string' || !/^todo_[a-f0-9]{64}$/u.test(entry.item))
    return 'invalid Todo item identity'
  if (draft.lifecycle === 'archived' || draft.frozen !== null || draft.lifecycle === 'initializing')
    return 'Todo write in a nonwritable session'
  const todos = draft.todos ?? []
  const found = todos.find(item => item.id === entry.item)
  if (entry.kind === 'session.todo-added') {
    if (!validTodoText(entry.text)) return 'invalid Todo text'
    if (found !== undefined) return 'duplicate Todo identity'
    draft.todos = [
      ...todos,
      {
        id: entry.item,
        text: entry.text,
        status: 'pending',
        createdAt: revision,
        changedAt: revision,
      },
    ]
    return null
  }
  if (found === undefined || found.status === 'removed') return 'Todo target is absent or removed'
  draft.todos = todos.map(item =>
    item.id === entry.item
      ? {
          ...item,
          status: entry.kind === 'session.todo-completed' ? 'completed' : 'removed',
          changedAt: revision,
        }
      : item,
  )
  return null
}
