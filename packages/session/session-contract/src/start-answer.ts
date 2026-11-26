import type { AdvanceRef } from './identity.ts'
import type { CommitReceipt, NotedStart, StartedRun } from './faces.ts'
import type { SessionCommand } from './ports.ts'
import type { WorkSnapshot } from './values.ts'

/** What a committed run start answers: the run it began, or the wait it only noted. */
export function startAnswerOf(
  command: Extract<SessionCommand, { kind: 'startRun' }>,
  snapshot: WorkSnapshot,
  receipt: CommitReceipt,
): StartedRun | NotedStart {
  const { note } = command.input
  if (note?.kind === 'waiting') return { receipt, noted: note }
  if (snapshot.run.kind !== 'active' || snapshot.run.advance === null)
    throw new Error('startRun committed without an active Run')
  const { advance, adoption, first, execution } = snapshot.run
  return { receipt, advance, adopted: adoption, first, execution: execution.execution }
}

/** What a committed claim or reload answers: the advance it granted; a reload that names no run grants none. */
export function advanceAnswerOf(
  command: Extract<SessionCommand, { kind: 'claim' | 'reload' }>,
  snapshot: WorkSnapshot,
  receipt: CommitReceipt,
): Readonly<{ receipt: CommitReceipt; advance: AdvanceRef | null }> {
  if (command.kind === 'reload' && command.input.run === null) return { receipt, advance: null }
  if (snapshot.run.kind !== 'active' || snapshot.run.advance === null)
    throw new Error(`${command.kind} committed without an advance`)
  return { receipt, advance: snapshot.run.advance }
}
