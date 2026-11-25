import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { compactionContextForView, type MaterializedModelView } from './model-view.ts'
import type { HistoryEntry, SessionFailure, SessionHistory } from './faces.ts'
import type { WorkSnapshot } from './values.ts'

// The model-view reads of the memory transaction double. Each answers from one held store of a
// session, whose key is checked after the reader's own input checks.

type ModelViewInput<P> = Parameters<SessionHistory<P>['readModelView']>[0]
type CompactionContextInput<P> = Parameters<SessionHistory<P>['readCompactionContext']>[0]
type Answer<P, K extends 'readModelView' | 'readCompactionContext'> = Awaited<
  ReturnType<SessionHistory<P>[K]>
>

function currentOf(view: MaterializedModelView, key: string) {
  return { epoch: `${key}/${view.epoch}`, upper: String(view.rows.length) }
}

export function memoryModelViewPage<P>(
  view: MaterializedModelView,
  key: Outcome<string, SessionFailure>,
  input: ModelViewInput<P>,
): Answer<P, 'readModelView'> {
  if (!Number.isInteger(input.pageBytes) || input.pageBytes < 1)
    return fail({ kind: 'invalid', field: 'pageBytes', reason: 'not a positive integer' })
  if ('failure' in key) return key
  const current = currentOf(view, key.ok)
  if (input.basis !== null && !input.basis.epoch.startsWith(`${key.ok}/`))
    return fail({ kind: 'invalid', field: 'basis', reason: 'another session' })
  if (input.basis !== null && input.basis.epoch !== current.epoch)
    return succeed({ kind: 'epoch-changed', current })
  const basis = input.basis ?? current
  const after = input.after === null ? 0 : Number(input.after)
  const upper = Number(basis.upper)
  if (
    !Number.isInteger(after) ||
    !Number.isInteger(upper) ||
    after < 0 ||
    upper > view.rows.length ||
    after > upper
  )
    return fail({ kind: 'invalid', field: 'basis', reason: 'invalid model view bounds' })
  const rows = []
  let bytes = 0
  for (const row of view.rows.slice(after, upper)) {
    if (rows.length > 0 && bytes + row.bytes > input.pageBytes) break
    rows.push(row)
    bytes += row.bytes
  }
  return succeed({
    kind: 'page',
    basis,
    rows,
    ...(input.resumeAtEnd && after + rows.length === upper ? { resume: String(upper) } : {}),
    next: after + rows.length < upper ? String(after + rows.length) : null,
  })
}

export function memoryCompactionContext<P>(
  store: Readonly<{
    entries: readonly HistoryEntry[]
    snapshot: WorkSnapshot
    modelView: MaterializedModelView
    inherited?: number
  }>,
  key: Outcome<string, SessionFailure>,
  input: CompactionContextInput<P>,
): Answer<P, 'readCompactionContext'> {
  if ('failure' in key) return key
  const view = store.modelView
  const current = currentOf(view, key.ok)
  if (input.basis.epoch !== current.epoch) return succeed({ kind: 'epoch-changed', current })
  const upper = Number(input.basis.upper)
  if (!Number.isInteger(upper) || upper < 1 || upper > view.rows.length)
    return fail({ kind: 'invalid', field: 'basis', reason: 'invalid model view bounds' })
  const value = compactionContextForView(
    store.entries,
    store.snapshot,
    view.rows,
    upper,
    input.coverTo,
    store.inherited,
  )
  if (value === null)
    return fail({ kind: 'invalid', field: 'coverTo', reason: 'outside the current window' })
  return succeed({ kind: 'context', basis: input.basis, value })
}
