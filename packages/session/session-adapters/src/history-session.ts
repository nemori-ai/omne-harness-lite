import type { DurableEvidence } from '@omne-harness/agent-contract'
import type { SessionId } from '@omne-harness/session-contract'
import { JOURNAL_OWNER } from './testing/journal-values.ts'

const HISTORY_RECORD = /^(\[(?:"(?:[^"\\]|\\.)*"(?:,"(?:[^"\\]|\\.)*")*)?\])\/(.+)\/history$/u

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
