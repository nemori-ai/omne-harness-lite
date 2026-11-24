import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeEntry } from './entries.ts'
import type { SessionModelSelection } from './control-values.ts'
import { TESTING_OWNER } from './testing-values.ts'
import type { HistoryEntry, SessionFailure } from './faces.ts'
import type { SessionId, SessionRevision } from './identity.ts'
import type { DecideReads, OperationRecord } from './judgments.ts'
import { materializeModelView, type MaterializedModelView } from './model-view.ts'
import type { SessionCommand } from './ports.ts'
import { reduce } from './reduce.ts'
import { childRecorded, relatedOf, relatedSessionOf } from './standing.ts'
import * as gone from './testing-calls-left.ts'
import { entryIdAt, type MemoryFork } from './testing-fork.ts'
import type { WorkSnapshot } from './values.ts'

type Held = Readonly<{
  snapshot: WorkSnapshot
  left: gone.CallsLeft
  modelView: MaterializedModelView
  entries: HistoryEntry[]
  fork?: MemoryFork
}>
type KeyOf = (tenant: TenantId, session: SessionId) => Outcome<string, SessionFailure>

function relatedStore<S extends Held>(
  stores: ReadonlyMap<string, S>,
  keyOf: KeyOf,
  command: SessionCommand,
): [string, S | undefined] | null {
  const other = command.kind === 'create' ? relatedSessionOf(command.input.creation) : null
  const key = other === null ? null : keyOf(command.input.tenant, other)
  return key === null || 'failure' in key ? null : [key.ok, stores.get(key.ok)]
}

export function relatedReads<S extends Held>(
  stores: ReadonlyMap<string, S>,
  keyOf: KeyOf,
  command: SessionCommand,
): Pick<DecideReads, 'related'> {
  const found = relatedStore(stores, keyOf, command)
  if (found === null) return {}
  return { related: found[1] === undefined ? null : relatedOf(found[1].snapshot) }
}

/** The parent log takes its entry in the commit that creates the child. */
export function recordChild<S extends Held>(
  stores: Map<string, S>,
  keyOf: KeyOf,
  command: SessionCommand,
): void {
  const record = command.kind === 'create' ? childRecorded(command.input) : null
  const [key, parent] = relatedStore(stores, keyOf, command) ?? []
  if (record === null || key === undefined || parent === undefined) return
  const revision = String(BigInt(parent.snapshot.revision) + 1n) as SessionRevision
  const id = entryIdAt(parent, 0)
  const entries: HistoryEntry[] = [{ ...record.entry, id, revision }]
  const reduced = reduce(parent.snapshot, { revision, entries }, undefined, gone.lookupOf(parent))
  if (reduced.kind === 'quarantined') throw new Error(reduced.diagnostic)
  const all = [...parent.entries, ...entries]
  stores.set(key, {
    ...parent,
    snapshot: reduced.snapshot,
    modelView: materializeModelView(parent.modelView, entries),
    entries: all,
    left: gone.leftAfter(parent, reduced),
  })
}

type Operated<O> = Readonly<{
  operations: ReadonlyMap<unknown, O>
  entries: readonly HistoryEntry[]
}>

/** The operation whose batch froze the session, when one did. */
export function frozenOperation<O extends Readonly<{ record: OperationRecord }>>(
  store: Operated<O> | undefined,
): O | undefined {
  if (store === undefined) return undefined
  return [...store.operations.values()].find(
    item =>
      item.record.receipt.source.record.endsWith('/' + item.record.operation) &&
      store.entries.some(
        entry => entry.kind === 'session.frozen' && entry.revision === item.record.receipt.revision,
      ),
  )
}

/** A session starts with its creation selection until a later commit selects a model. */
export function readStoredModelSelection(
  store: Operated<{ record: OperationRecord }> & Pick<Held, 'snapshot'>,
): Outcome<SessionModelSelection, SessionFailure> {
  let selection = store.snapshot.creation.initialModelSelection
  let revision = store.entries[0]?.revision
  for (const row of store.entries) {
    if (row.kind !== 'session.model-selected') continue
    const entry = decodeEntry(row)
    if (
      'ok' in entry &&
      entry.ok.kind === 'session.model-selected' &&
      entry.ok.declaration.kind === 'model'
    ) {
      const { kind: _kind, ...saved } = entry.ok.declaration
      selection = saved
      revision = row.revision
    }
  }
  if (selection === undefined || revision === undefined) return fail({ kind: 'not-ready' })
  const origin = [...store.operations.values()].find(
    item => item.record.receipt.revision === revision,
  )
  if (origin === undefined)
    return fail({
      kind: 'unavailable',
      owner: TESTING_OWNER,
      diagnostic: 'the commit that saved the selection has no original receipt',
    })
  return succeed({
    selection,
    revision: store.snapshot.revision,
    source: origin.record.receipt.source,
  })
}
