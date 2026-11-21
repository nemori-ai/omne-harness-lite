import type { HistoryEntry, SessionCommand } from '@omne-harness/session-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { startFork } from './fork.ts'
import { assignPositions, big, type Row } from './support.ts'

type Start = Readonly<{ tenant: string; session: string; journal: Row | undefined }>
type Positioned = Readonly<{ tail: bigint; seq: bigint; revision: string; entries: HistoryEntry[] }>

/** The place of the batch of a command in its log; a create with a source first writes where it starts. */
export function positioned(
  port: ParticipantPort,
  start: Start,
  encoded: readonly object[],
  command: SessionCommand,
): Positioned {
  const { tenant, session, journal } = start
  const tail = journal === undefined ? 0n : big(journal['tail'])
  const seq = journal === undefined ? 1n : big(journal['commit_seq']) + 1n
  const revision = String(tail + 1n)
  startFork(port, { tenant, session }, command)
  const entries = assignPositions(port, { tenant, session }, revision, encoded)
  return { tail, seq, revision, entries }
}
