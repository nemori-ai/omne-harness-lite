import type { SessionNotifier } from '@omne-harness/session-contract'
import type { DomainRef, ReceiptV2, SqlStorage } from '@omne-harness/sql-contract'
import { SESSION_PARTICIPANT, writtenOf, type SessionCommittedBatch } from './session-reply.ts'
import { foldCommitted, type WorkCacheBounds } from './work-cache.ts'

const registered = new WeakMap<object, Set<Readonly<{ notifier: SessionNotifier }>>>()

export function registerSessionNotifier(
  storage: SqlStorage,
  notifier: SessionNotifier,
): () => void {
  const database = storage.database
  let held = registered.get(database)
  if (held === undefined) {
    held = new Set()
    registered.set(database, held)
  }
  const entry = { notifier }
  held.add(entry)
  return () => {
    held.delete(entry)
  }
}

function tell(storage: SqlStorage, batch: SessionCommittedBatch): void {
  for (const { notifier } of registered.get(storage.database) ?? [])
    void Promise.resolve()
      .then(() => notifier.committed(batch))
      .catch(() => undefined)
}

export type SessionCommitAnswer = Readonly<{ receipt: ReceiptV2; recalled: boolean }> | null

export type SessionCommitLanding = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  tenant: string
  session: string
  answer: SessionCommitAnswer
  journal?: Readonly<{ published: string | null }>
  bounds?: WorkCacheBounds
}>

type Written = NonNullable<ReturnType<typeof writtenOf>>

function writtenIn(receipt: ReceiptV2): Written {
  const entry = receipt.responses.find(item => item.participant === SESSION_PARTICIPANT)
  return (entry === undefined ? null : writtenOf(entry.reply)) ?? {}
}

function fold(input: SessionCommitLanding, work: Written['work']): Promise<void> {
  const { storage, domain, tenant, session, journal, bounds } = input
  const reach = { storage, domain, tenant, session, ...(bounds === undefined ? {} : { bounds }) }
  if (journal === undefined)
    return work === undefined ? Promise.resolve() : foldCommitted(reach, work)
  if (journal.published === null) return Promise.resolve()
  // A Journal-only publication changes no Session state. The cache keeps its old
  // published fence; a later work read validates it before using the history index.
  return work === undefined ? Promise.resolve() : foldCommitted(reach, work, 'next')
}

export async function afterSessionCommit(input: SessionCommitLanding): Promise<void> {
  const { answer } = input
  if (answer === null || answer.recalled) return
  try {
    const written = writtenIn(answer.receipt)
    await fold(input, written.work)
    if (written.batch !== undefined) tell(input.storage, written.batch)
  } catch {}
}
