// The one landing of a storage commit that carried a Session participation (SPEC「本批与提交通知」).
// The session log has one writer, the `session` participant in the write Worker, and four
// committers hand it commands: the command entry, the entries channel and the log channel (all
// through `commitFacts`), and the Session participation of an Agent journal commit (the Journal
// provider of session-adapters). Each committer hands the storage answer of its commit here, and
// nothing else: what follows a commit hangs on the writer, not on the committers.
//
// Here and only here: is it a fresh commit (a storage recall, a recovered answer of the writer and
// a rollback are not); fold the batch into the work cache of the database (SPEC RT-04); tell the
// batch the writer gave to every `SessionNotifier` registered on the database. A notifier is not
// awaited and its failure is caught, so it changes no answer and holds up no commit. The landing
// keeps no state of its own and never throws.
import type { SessionNotifier } from '@omne-harness/session-contract'
import type { DomainRef, ReceiptV2, SqlStorage } from '@omne-harness/sql-contract'
import { SESSION_PARTICIPANT, writtenOf, type SessionCommittedBatch } from './session-reply.ts'
import { foldCommitted, refreshWorkIndex, type WorkCacheBounds } from './work-cache.ts'

/** The notifiers registered on each database, by the identity `SqlStorage.database`. */
const registered = new WeakMap<object, Set<Readonly<{ notifier: SessionNotifier }>>>()

/**
 * Registers `notifier` on the database behind `storage`: every fresh batch any committer of this
 * process writes there is told to it once. Answers the function that unregisters it; after that it
 * is told nothing. Registering the same notifier twice tells it twice.
 */
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
    // Not awaited, and a throw or a rejection ends here: the commit answered already.
    void Promise.resolve()
      .then(() => notifier.committed(batch))
      .catch(() => undefined)
}

/**
 * The storage answer of one commit a committer sent: the committed receipt and whether the storage
 * recalled it as the receipt of an earlier call (sql-contract §8). Null when it did not commit.
 */
export type SessionCommitAnswer = Readonly<{ receipt: ReceiptV2; recalled: boolean }> | null

export type SessionCommitLanding = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  /** The tenant text the domain was resolved for. */
  tenant: string
  session: string
  answer: SessionCommitAnswer
  /**
   * Set by an Agent journal commit: the publication count of the Agent records after it, or null
   * when the Journal does not know it. A batch of its Session participation is folded one count
   * up; without one, the index of the held snapshot is replaced. Absent for a commit of the
   * Session participant alone, whose batch is folded at the same count.
   */
  journal?: Readonly<{ published: string | null }>
  bounds?: WorkCacheBounds
}>

/** The one landing of a commit: fresh or not, the work cache, then the notice. It never throws. */
export async function afterSessionCommit(input: SessionCommitLanding): Promise<void> {
  const { storage, domain, tenant, session, answer, journal } = input
  if (answer === null || answer.recalled) return
  try {
    const entry = answer.receipt.responses.find(item => item.participant === SESSION_PARTICIPANT)
    const written = entry === undefined ? null : writtenOf(entry.reply)
    const reach = {
      storage,
      domain,
      tenant,
      session,
      ...(input.bounds === undefined ? {} : { bounds: input.bounds }),
    }
    if (journal === undefined) {
      if (written?.work !== undefined) await foldCommitted(reach, written.work)
    } else if (journal.published !== null) {
      await (written?.work === undefined
        ? refreshWorkIndex(reach, journal.published)
        : foldCommitted(reach, written.work, 'next'))
    }
    if (written?.batch !== undefined) tell(storage, written.batch)
  } catch {
    // The fold and the notice never change an answer; neither throws, this is the last guard.
  }
}
