// R2-D14: the session that a history evidence of the Journal core names. The core mints the history
// evidence of an execution with `journalEvidence`: its record is the namespace of the session's
// cell, the execution and `/history`, and its owner is the Journal's. The namespace is the JSON
// text `[tenant, session]`, the same one that `materialSessionOf` reads out of a material source
// (`./cordis/agent-journal.ts`); this file keeps its own copy of that small parse so the two
// decoders stay independent, and decodes only what the core mints.
//
// The answer names a session. It does not authorize a read of it, and it does not read
// `consumer.work`: the caller checks the access before it uses the session.
import type { DurableEvidence } from '@omne-harness/agent-contract'
import type { SessionId } from '@omne-harness/session-contract'
import { JOURNAL_OWNER } from './testing/journal-values.ts'

/** A JSON array of strings, then the execution, then `/history`. */
const HISTORY_RECORD = /^(\[(?:"(?:[^"\\]|\\.)*"(?:,"(?:[^"\\]|\\.)*")*)?\])\/(.+)\/history$/u

/**
 * The tenant text and session of a history evidence that the Journal core minted, or null for an
 * evidence it did not mint or whose record does not have the shape the core gives it.
 */
export function historySessionOf(
  source: DurableEvidence,
): Readonly<{ tenant: string; session: SessionId }> | null {
  if (source.owner !== JOURNAL_OWNER) return null
  const matched = HISTORY_RECORD.exec(source.record)
  if (matched === null) return null
  let namespace: unknown
  try {
    namespace = JSON.parse(matched[1] ?? '')
  } catch {
    return null
  }
  if (!Array.isArray(namespace) || namespace.length !== 2) return null
  const [tenant, session] = namespace as unknown[]
  return typeof tenant === 'string' && typeof session === 'string'
    ? { tenant, session: session as SessionId }
    : null
}
