// S1, the advance trigger (SPEC S1), and the open-Run part of C2, the Agent advance coordinator
// (SPEC C2 顺序：开 Run): judgeRunStart → startRun → invoke → receive(input-handover). Each face
// operation takes its own principal (SPEC cp-access): S1 reads as `maintainer`, C2 commits as
// `coordinator`. The other C2 sequences (continuation, same-log interpretation, recovery, reload)
// are not in this member yet; SPEC「实现现状」lists them with their triggers.
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  deriveDriveOperation,
  deriveSessionOperation,
  judgeRunStart,
  type AgentDrivePort,
  type DriveFailure,
  type DriveReceipt,
  type DurableEvidence,
  type FreezeVerdict,
  type InputId,
  type SessionFaces,
  type SessionFailure,
  type StartedRun,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import { messageOf } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import type { Resolution } from './resolution.ts'
import { sessionKey, type Actor, type Scheduling, type SessionRef } from './scheduling.ts'
import { sessionSlotReference } from './slot-reference.ts'

export type Advance = Readonly<{
  /** Wakes S1 for one session. A trigger in flight absorbs later ones into one more check. */
  trigger(ref: SessionRef): void
}>

type Faces<P> = Readonly<Record<Actor, SessionFaces<P>>>

export function createAdvance<P>(
  input: Readonly<{
    dependencies: SessionDependencies<P>
    lifecycle: Lifecycle
    policy: SchedulingPolicy
    scheduling: Scheduling<P>
    resolution: Resolution
    faces: Faces<P>
  }>,
): Advance {
  const { dependencies, lifecycle, policy, scheduling, resolution, faces } = input
  const coordinator = faces.coordinator.work

  /** One face operation as `actor`: its own principal first; a principal failure stops the step. */
  const as = async <T>(
    actor: Actor,
    ref: SessionRef,
    operation: (principal: P) => Promise<Outcome<T, SessionFailure>>,
  ): Promise<Outcome<T, SessionFailure>> => {
    const principal = await scheduling.principal(actor, ref)
    if ('failure' in principal) return fail(principal.failure)
    return operation(principal.ok)
  }

  /** A `commit-unknown` goes to S4, which resumes the same step with the same identity. */
  const unknownTo = (
    ref: SessionRef,
    answer: Outcome<unknown, SessionFailure>,
    resume: () => Promise<void>,
  ): void => {
    if ('failure' in answer && answer.failure.kind === 'commit-unknown')
      resolution.watch(ref, answer.failure.operation, () =>
        scheduling.serial(sessionKey(ref), resume),
      )
  }

  const drive = (): AgentDrivePort | null => {
    try {
      return dependencies.agentDrive.current()
    } catch {
      return null
    }
  }

  const handOver = async (
    ref: SessionRef,
    started: StartedRun,
    receipt: DurableEvidence,
  ): Promise<void> => {
    const fact = {
      kind: 'input-handover' as const,
      execution: started.execution,
      input: started.first,
      result: { kind: 'accepted' as const, receipt },
    }
    const operation = deriveSessionOperation({ kind: 'fact', fact })
    const answer = await as('coordinator', ref, principal =>
      faces.coordinator.reconciliation.receive({ principal, ...ref, operation, fact }),
    )
    unknownTo(ref, answer, () => handOver(ref, started, receipt))
  }

  /** PM-02: the first input refused by the message admission closes the Run with a bounded failure. */
  const closeRefused = async (
    ref: SessionRef,
    started: StartedRun,
    rejection: DurableEvidence,
  ): Promise<void> => {
    const snapshot = await as('coordinator', ref, principal =>
      coordinator.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot) return
    const bounded = { kind: 'admission-rejected' as const, input: started.first, rejection }
    const run = started.advance.run
    const operation = deriveSessionOperation({ kind: 'bounded-close', run, basis: bounded })
    const answer = await as('coordinator', ref, principal =>
      coordinator.finishRun({
        principal,
        ...ref,
        operation,
        run,
        expected: snapshot.ok.revision,
        bounded,
      }),
    )
    unknownTo(ref, answer, () => closeRefused(ref, started, rejection))
  }

  const invokeOnce = async (
    port: AgentDrivePort,
    target: Parameters<AgentDrivePort['invoke']>[0],
  ): Promise<Outcome<DriveReceipt, DriveFailure>> => {
    try {
      return await port.invoke(target)
    } catch (error) {
      return fail({ kind: 'unavailable', diagnostic: `invoke threw: ${messageOf(error)}` })
    }
  }

  /** Whether the Agent already knows the outcome of the invoke, so it may be sent again at once. */
  const settled = async (
    port: AgentDrivePort,
    target: Parameters<AgentDrivePort['query']>[0],
  ): Promise<boolean> => {
    try {
      const answer = await port.query(target)
      return 'ok' in answer && answer.ok !== 'unknown'
    } catch {
      return false
    }
  }

  /**
   * The outbound invoke with the identity derived from the committed start (OP-00). `busy`,
   * `unavailable` and an unknown outcome back off by `advance.retryDelaysMs`, always with the same
   * identity; when the sequence runs out the Run waits for S3. Nothing is sent once closed.
   */
  const invoke = async (ref: SessionRef, started: StartedRun): Promise<void> => {
    const operation = deriveDriveOperation({
      kind: 'invoke',
      execution: started.execution,
      first: started.first,
      started: started.receipt.source,
    })
    const target = { ...ref, execution: started.execution, operation }
    const delays = policy.advance.retryDelaysMs
    for (let attempt = 0; ; attempt += 1) {
      const port = drive()
      if (lifecycle.closed || port === null) return
      const answer = await invokeOnce(port, {
        ...target,
        first: started.first,
        source: started.receipt.source,
        grant: started.receipt.source,
      })
      if ('ok' in answer) return handOver(ref, started, answer.ok.evidence)
      const failure = answer.failure
      if (failure.kind === 'invalid') return closeRefused(ref, started, failure.rejection)
      if (
        failure.kind !== 'busy' &&
        failure.kind !== 'unavailable' &&
        failure.kind !== 'commit-unknown'
      )
        return
      const delay = delays[attempt]
      if (delay === undefined) return
      if (failure.kind === 'commit-unknown' && (await settled(port, target))) continue
      if (!(await scheduling.wait(delay))) return
    }
  }

  const freeze = async (ref: SessionRef, verdict: FreezeVerdict): Promise<void> => {
    const operation = deriveSessionOperation({
      kind: 'freeze',
      session: ref.session,
      evidence: verdict.evidence,
    })
    const answer = await as('coordinator', ref, principal =>
      faces.coordinator.management.freeze({ principal, ...ref, operation, verdict }),
    )
    unknownTo(ref, answer, () => freeze(ref, verdict))
  }

  const openRun = async (
    ref: SessionRef,
    snapshot: WorkSnapshot,
    first: InputId,
  ): Promise<void> => {
    const candidate = snapshot.definition.adopted
    const operation = deriveSessionOperation({
      kind: 'startRun',
      session: ref.session,
      first,
      predecessor: snapshot.run.kind === 'terminal' ? snapshot.run.terminal.run : null,
    })
    const started = await as('coordinator', ref, principal =>
      coordinator.startRun({
        principal,
        ...ref,
        operation,
        entry: 'interactive',
        candidate,
        instance: sessionSlotReference(ref.session, candidate),
      }),
    )
    if ('ok' in started) return invoke(ref, started.ok)
    if (started.failure.kind === 'frozen' && started.failure.verdict !== null)
      return freeze(ref, started.failure.verdict)
    unknownTo(ref, started, () => openRun(ref, snapshot, first))
  }

  /** S1: read the snapshot and, when a new Run may start, hand the session to C2. */
  const check = async (ref: SessionRef): Promise<void> => {
    const snapshot = await as('maintainer', ref, principal =>
      faces.maintainer.work.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot) return
    // A frozen session starts no new Run (I-F2): skip without judging.
    if (snapshot.ok.frozen !== null && snapshot.ok.run.kind !== 'active') return
    const judgment = judgeRunStart(snapshot.ok, 'interactive')
    if (judgment.kind !== 'eligible') return
    const opened = snapshot.ok
    await scheduling.serial(sessionKey(ref), () => openRun(ref, opened, judgment.first))
  }

  const triggers = new Map<string, { again: boolean }>()
  return {
    trigger: ref => {
      if (lifecycle.closed) return
      const key = sessionKey(ref)
      const inFlight = triggers.get(key)
      if (inFlight !== undefined) {
        inFlight.again = true
        return
      }
      const state = { again: false }
      triggers.set(key, state)
      lifecycle.spawn(async () => {
        try {
          do {
            state.again = false
            await check(ref)
          } while (state.again && !lifecycle.closed)
        } finally {
          triggers.delete(key)
        }
      })
    },
  }
}
