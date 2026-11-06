import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  SessionTodos,
  SessionTransactionPort,
  TodoPageCursor,
  VisibleTodoItem,
} from '@omne-harness/session-contract'
import { readSnapshot } from './qualify.ts'

function validCursor(cursor: TodoPageCursor): boolean {
  return (
    typeof cursor === 'object' &&
    cursor !== null &&
    !Array.isArray(cursor) &&
    Object.keys(cursor).sort().join(',') === 'after,revision,session,tenant' &&
    typeof cursor.tenant === 'string' &&
    tenantCodec.parse(cursor.tenant).ok &&
    typeof cursor.session === 'string' &&
    cursor.session.length > 0 &&
    typeof cursor.revision === 'string' &&
    /^(0|[1-9]\d*)$/u.test(cursor.revision) &&
    typeof cursor.after === 'string' &&
    /^todo_[a-f0-9]{64}$/u.test(cursor.after)
  )
}

export async function listTodos<P>(
  view: SessionTransactionPort<P>,
  input: Parameters<SessionTodos<P>['listTodos']>[0],
): ReturnType<SessionTodos<P>['listTodos']> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
    return fail({ kind: 'invalid', field: 'limit', reason: 'expected an integer from 1 to 100' })
  const tenant = tenantCodec.encode(input.tenant)
  const after = input.after
  if (
    !tenant.ok ||
    (after !== null &&
      (!validCursor(after) || after.tenant !== tenant.value || after.session !== input.session))
  )
    return fail({
      kind: 'invalid',
      field: 'after',
      reason: 'cursor does not identify this tenant and session',
    })
  const read = await readSnapshot(view, input, 'listTodos')
  if ('failure' in read) return read
  const snapshot = read.ok
  if (after !== null && after.revision !== snapshot.revision)
    return fail({ kind: 'changed', revision: snapshot.revision })
  const visible = (snapshot.todos ?? []).filter(
    (item): item is VisibleTodoItem => item.status !== 'removed',
  )
  const index = after === null ? -1 : visible.findIndex(item => item.id === after.after)
  if (after !== null && index === -1)
    return fail({
      kind: 'invalid',
      field: 'after',
      reason: 'cursor item is not visible at this revision',
    })
  const items = Object.freeze(
    visible.slice(index + 1, index + 1 + input.limit).map(item => Object.freeze({ ...item })),
  )
  const last = items.at(-1)
  const next =
    last !== undefined && index + 1 + items.length < visible.length
      ? Object.freeze({
          tenant: tenant.value,
          session: input.session,
          revision: snapshot.revision,
          after: last.id,
        })
      : null
  return succeed(Object.freeze({ revision: snapshot.revision, items, next }))
}
