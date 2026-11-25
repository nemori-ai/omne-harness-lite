import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  deriveSessionOperation,
  expectedRevision,
  type ReloadOutcome,
  type SessionAccess,
  type SessionFaces,
  type SessionFailure,
  type SessionOperationId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { CommandHandler } from './command.ts'
import type { SessionDependencies } from './dependencies.ts'
import { readSnapshot } from './qualify.ts'
import type { Reads } from './reads.ts'
import type { Scheduling, SessionRef } from './scheduling.ts'

type Asked<P> = SessionAccess<P> & Readonly<{ operation: SessionOperationId }>

export type ReloadInput<P> = Readonly<{
  dependencies: SessionDependencies<P>
  scheduling: Scheduling<P>
  reads: Reads<P>
  handle: CommandHandler<P>
  coordinator: SessionFaces<P>
}>

const unchanged = (work: WorkSnapshot, adoption: Readonly<{ candidate: unknown }>) =>
  JSON.stringify(work.definition.adopted) === JSON.stringify(adoption.candidate)

/** A person asks the session to take the definition in force now: idle, the next run uses it; with a run going on, it waits for the next. */
export function createReload<P>(input: ReloadInput<P>) {
  const { dependencies, scheduling, reads, handle, coordinator } = input

  const freeze = async (
    ref: SessionRef,
    verdict: Parameters<SessionFaces<P>['management']['freeze']>[0]['verdict'],
  ): Promise<void> => {
    const principal = await scheduling.principal('coordinator', ref)
    if ('failure' in principal) return
    const operation = deriveSessionOperation({
      kind: 'freeze',
      session: ref.session,
      evidence: verdict.evidence,
    })
    await coordinator.management.freeze({ principal: principal.ok, ...ref, operation, verdict })
  }

  return async (asked: Asked<P>): Promise<Outcome<ReloadOutcome, SessionFailure>> => {
    const ref = { tenant: asked.tenant, session: asked.session }
    const access = { principal: asked.principal, ...ref }
    // The person reads the session as they read what it waits for: no other right is asked.
    const read = await reads.session('intake', 'readWaiting', access, view =>
      readSnapshot(view, access, 'reloadSession'),
    )
    if ('failure' in read) return read
    const work = read.ok
    if (work.lifecycle === 'archived') return fail({ kind: 'archived' })
    if (work.frozen !== null) return fail({ kind: 'frozen', verdict: work.frozen })
    if (work.run.kind === 'active') return succeed({ kind: 'next-run' })
    const runAdoption = dependencies.evidence.runAdoption
    if (runAdoption === undefined) return succeed({ kind: 'no-change' })
    const principal = await scheduling.principal('coordinator', ref)
    if ('failure' in principal) return principal
    const adopted = await runAdoption({ principal: principal.ok, ...ref }, { work, run: null })
    if ('failure' in adopted) return adopted
    const answer = adopted.ok
    if (answer.kind !== 'adopt')
      return fail({ kind: 'invalid', field: 'candidate', reason: answer.reason })
    const { candidate, residentAdoption } = answer
    if (residentAdoption?.verdict !== undefined) {
      await freeze(ref, residentAdoption.verdict)
      return fail({ kind: 'frozen', verdict: residentAdoption.verdict })
    }
    if (unchanged(work, answer) && residentAdoption === undefined)
      return succeed({ kind: 'no-change' })
    const committed = await handle(
      'intake',
      {
        kind: 'reload',
        input: {
          ...ref,
          operation: asked.operation,
          run: null,
          candidate,
          expected: expectedRevision(work, 'reload'),
          ...(residentAdoption === undefined ? {} : { residentAdoption }),
        },
      },
      asked.principal,
    )
    if ('failure' in committed) return committed
    const { receipt } = committed.ok as {
      receipt: Extract<ReloadOutcome, { kind: 'adopted' }>['receipt']
    }
    return succeed({ kind: 'adopted', receipt })
  }
}
