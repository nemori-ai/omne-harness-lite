import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  cancelEstablished,
  deriveDriveOperation,
  deriveSessionOperation,
  expectedRevision,
  type AgentDrivePort,
  type DriveFailure,
  type DurableEvidence,
  type ReloadOutcome,
  type RunAdoption,
  type SessionAccess,
  type SessionCommand,
  type SessionFaces,
  type SessionFailure,
  type SessionOperationId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { CommandHandler } from './command.ts'
import type { SessionDependencies } from './dependencies.ts'
import { unavailable, OWNERS } from './failures.ts'
import { readSnapshot } from './qualify.ts'
import type { Reads } from './reads.ts'
import { currentDrive, outbound, type Recovery } from './recover.ts'
import { sessionKey, type Scheduling, type SessionRef } from './scheduling.ts'
import { sessionSlotReference } from './slot-reference.ts'

type Asked<P> = SessionAccess<P> & Readonly<{ operation: SessionOperationId }>
type Adopt = Extract<RunAdoption, { kind: 'adopt' }>
type ActiveRun = Extract<WorkSnapshot['run'], { kind: 'active' }>
type Answer = Outcome<ReloadOutcome, SessionFailure>
type Pass = { retrigger: boolean }
type Taking = Readonly<{ work: WorkSnapshot; answer: Adopt; run: ActiveRun }>

export type ReloadInput<P> = Readonly<{
  dependencies: SessionDependencies<P>
  scheduling: Scheduling<P>
  reads: Reads<P>
  handle: CommandHandler<P>
  coordinator: SessionFaces<P>
  recovery: Recovery
}>

/** The reload command: with the run and its handover when one goes on, naming no run when idle. */
function reloadCommand<P>(
  asked: Asked<P>,
  work: WorkSnapshot,
  answer: Adopt,
  run: Readonly<{ run: ActiveRun['run']; handover: DurableEvidence }> | null,
): SessionCommand {
  return {
    kind: 'reload',
    input: {
      tenant: asked.tenant,
      session: asked.session,
      operation: asked.operation,
      run: run?.run ?? null,
      candidate: answer.candidate,
      expected: expectedRevision(work, 'reload'),
      ...(run === null
        ? {}
        : {
            instance: sessionSlotReference(asked.session, answer.candidate),
            handover: run.handover,
          }),
      ...(answer.residentAdoption === undefined
        ? {}
        : { residentAdoption: answer.residentAdoption }),
    },
  }
}

function refusedHandover(failure: DriveFailure): SessionFailure {
  if (failure.kind === 'stale-advance') return { kind: 'stale-advance', current: null }
  if (failure.kind === 'terminal') return { kind: 'run-active' }
  return unavailable(OWNERS.session, `the Agent did not hand the run over: ${failure.kind}`)
}

const unchanged = (work: WorkSnapshot, adoption: Adopt) =>
  JSON.stringify(work.definition.adopted) === JSON.stringify(adoption.candidate)

type Receipt = Extract<ReloadOutcome, { kind: 'adopted' }>['receipt']
const AGAIN: ReadonlySet<SessionFailure['kind']> = new Set(['run-active', 'changed'])

/** A person asks the session to take the definition in force now: idle, the next run uses it; with a run going on, that run is handed over to it. */
export function createReload<P>(input: ReloadInput<P>) {
  const { dependencies, scheduling, reads, handle, coordinator, recovery } = input

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

  /** In the serial section, at the revision read before the handover: commit the reload and join the new attempt. */
  const commitAndJoin = async (
    asked: Asked<P>,
    port: AgentDrivePort,
    taking: Taking,
    handover: DurableEvidence,
    pass: Pass,
  ): Promise<Answer> => {
    const ref = { tenant: asked.tenant, session: asked.session }
    const { work, answer, run } = taking
    pass.retrigger = true
    const execution = run.execution.execution
    // Another reload may have joined the execution since this one was handed the same handover.
    const status = await outbound(() => port.inspect({ ...ref, execution }))
    if (!('ok' in status) || status.ok.state !== 'suspended')
      return fail({ kind: 'stale-advance', current: null })
    const command = reloadCommand(asked, work, answer, { run: run.run, handover })
    const committed = await handle('intake', command, asked.principal)
    if ('failure' in committed) return committed
    const { receipt } = committed.ok as { receipt: Receipt }
    const joining = { run: run.run, execution, handover, grant: receipt.source }
    pass.retrigger = !(await recovery.join(ref, port, joining))
    return succeed({ kind: 'handed-over', receipt })
  }

  const handOver = async (asked: Asked<P>, taking: Taking, pass: Pass): Promise<Answer> => {
    const ref = { tenant: asked.tenant, session: asked.session }
    const { run } = taking
    const port = currentDrive(dependencies)
    const { advance } = run
    if (port === null || advance === null)
      return fail(unavailable(OWNERS.session, 'no Agent drive to hand the run over'))
    const execution = run.execution.execution
    const operation = deriveDriveOperation({
      kind: 'hand-over',
      execution,
      advance,
      reload: asked.operation,
    })
    const handed = await outbound(() => port.handOver({ ...ref, execution, operation, advance }))
    if ('failure' in handed) return fail(refusedHandover(handed.failure))
    let answered: Answer = fail(unavailable(OWNERS.session, 'the reload was not committed'))
    await scheduling.serial(sessionKey(ref), async () => {
      answered = await commitAndJoin(asked, port, taking, handed.ok, pass)
    })
    return answered
  }

  const once = async (asked: Asked<P>, pass: Pass): Promise<Answer> => {
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
    const run = work.run.kind === 'active' ? work.run : null
    if (run !== null && cancelEstablished(work, run.run)) return fail({ kind: 'cancelled' })
    const runAdoption = dependencies.evidence.runAdoption
    if (runAdoption === undefined) return succeed({ kind: 'no-change' })
    const principal = await scheduling.principal('coordinator', ref)
    if ('failure' in principal) return principal
    const adopted = await runAdoption(
      { principal: principal.ok, ...ref },
      { work, run: run?.run ?? null, point: asked.operation },
    )
    if ('failure' in adopted) return adopted
    const answer = adopted.ok
    if (answer.kind !== 'adopt')
      return fail({ kind: 'invalid', field: 'candidate', reason: answer.reason })
    const verdict = answer.residentAdoption?.verdict
    if (verdict !== undefined) {
      await freeze(ref, verdict)
      return fail({ kind: 'frozen', verdict })
    }
    if (unchanged(work, answer) && answer.residentAdoption === undefined)
      return succeed({ kind: 'no-change' })
    if (run !== null) return handOver(asked, { work, answer, run }, pass)
    const committed = await handle(
      'intake',
      reloadCommand(asked, work, answer, null),
      asked.principal,
    )
    if ('failure' in committed) return committed
    return succeed({ kind: 'adopted', receipt: (committed.ok as { receipt: Receipt }).receipt })
  }

  return async (asked: Asked<P>): Promise<Answer> => {
    const ref = { tenant: asked.tenant, session: asked.session }
    const pass: Pass = { retrigger: false }
    const answered = await recovery.holding(ref, async () => {
      let answer = await once(asked, pass)
      // The run ended as it was asked, or the session moved under the read: read and judge again.
      for (
        let again = 0;
        again < 2 && 'failure' in answer && AGAIN.has(answer.failure.kind);
        again++
      )
        answer = await once(asked, pass)
      return answer
    })
    if (pass.retrigger) recovery.trigger(ref)
    return answered
  }
}
