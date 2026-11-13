// S1, the advance trigger (SPEC S1), and two sequences of C2, the Agent advance coordinator: open
// Run (SPEC C2 顺序：开 Run: judgeRunStart → startRun → invoke → receive(input-handover), then the
// other waiting inputs) and continuation (顺序：续入: each input that waits for the active Run without
// a hand-over is submitted, then receive(input-handover)). Each face operation takes its own
// principal (SPEC cp-access): S1 reads as `maintainer`, C2 commits as `coordinator`. A granted Run
// whose invoke the Agent has not accepted is invoked again with the same outbound identity
// (contract PA-06 item 2, PM-14); a waiting input is submitted again with its own (PA-06 item 3).
// Every step that stops on a failure records a named diagnostic (SPEC C2 失败分支, R2-D327). The
// other C2 sequences (same-log interpretation, takeover, reload) are not in this member yet; SPEC
// 「实现现状」lists them with their triggers.
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  deriveDriveOperation,
  deriveSessionOperation,
  expectedRevision,
  judgeAdvance,
  judgeRunStart,
  type AgentDrivePort,
  type BoundedClose,
  type DriveFailure,
  type DriveReceipt,
  type DurableEvidence,
  type FreezeVerdict,
  type InputId,
  type ProducerFact,
  type RunId,
  type SessionFaces,
  type SessionFailure,
  type StartedRun,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import type { SessionDiagnostic } from './diagnostics.ts'
import { messageOf } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import type { Resolution } from './resolution.ts'
import { sessionKey, type Actor, type Scheduling, type SessionRef } from './scheduling.ts'
import { sessionSlotReference } from './slot-reference.ts'

export type Advance = Readonly<{
  /** Wakes S1 for one session. A trigger in flight absorbs later ones into one more check. */
  trigger(ref: SessionRef): void
  interrupt(ref: SessionRef): boolean
}>

type Faces<P> = Readonly<Record<Actor, SessionFaces<P>>>

type ActiveRun = Extract<WorkSnapshot['run'], { kind: 'active' }>

type HandoverFact = Extract<ProducerFact, { kind: 'input-handover' }>

/** Whether the step may go on; a failed read comes back as the failure, so the caller can report it. */
type Holding = boolean | Readonly<{ failure: SessionFailure }>

/**
 * PA-06 item 2: the Run is active, an attempt holds the advance and the first input has no
 * hand-over (SE35) yet, so the invoke of the Run was not accepted, or its acceptance not recorded.
 */
function grantedNotInvoked(snapshot: WorkSnapshot): ActiveRun | null {
  const { run } = snapshot
  if (run.kind !== 'active' || run.advance === null) return null
  if (!snapshot.pending.includes(run.first) || snapshot.handed.includes(run.first)) return null
  return run
}

/**
 * C2 续入 (PA-06 item 3, PM-02 item 3): the active Run whose attempt holds the advance, with the
 * inputs that wait for it without a hand-over (SE35), in arrival order. While a Run is active every
 * accepted input is routed to it (an input accepted after the terminal waits for the next Run,
 * PA-03), so these are the inputs that block a conditional finish (`judgeCompletion`, PA-02). The
 * first input is the open Run's own: S1 replays its invoke first (`grantedNotInvoked`), and the
 * invoke hands the others in once the Agent accepted it, whether or not its SE35 was recorded.
 */
function waitingInputs(
  snapshot: WorkSnapshot,
): Readonly<{ run: ActiveRun; inputs: readonly InputId[] }> | null {
  const { run } = snapshot
  if (run.kind !== 'active' || run.advance === null) return null
  const handed = new Set(snapshot.handed)
  const inputs = snapshot.pending.filter(input => input !== run.first && !handed.has(input))
  return inputs.length === 0 ? null : { run, inputs }
}

/**
 * The source basis of a submit (PA-01 item 2): the receipt of the SE11 (`intake.routed`) entry of
 * the input, as the history index of the snapshot gives it out. Null when the snapshot came without
 * an index (over its read bound) or the index does not list the input: then nothing is sent.
 */
function routedSource(snapshot: WorkSnapshot, input: InputId): DurableEvidence | null {
  return snapshot.historyIndex?.inputs.find(item => item.input === input)?.source ?? null
}

/** The Run before the active one: the predecessor that the OP-00 identity of its startRun names. */
function predecessorOf(snapshot: WorkSnapshot, run: RunId): RunId | null {
  const executions = snapshot.executions ?? []
  const at = executions.findIndex(item => item.run === run)
  return at > 0 ? (executions[at - 1]?.run ?? null) : null
}

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
  const waiting = new Map<string, AbortController>()

  /** Records a stopped step. Nothing is reported once the instance closes: closing is no failure. */
  const report = (
    ref: SessionRef,
    owner: SessionDiagnostic['owner'],
    step: SessionDiagnostic['step'],
    run: RunId | null,
    reason: string,
    detail: unknown,
  ): void => {
    if (lifecycle.closed) return
    lifecycle.diagnose({
      owner,
      step,
      tenant: ref.tenant,
      session: ref.session,
      run,
      reason,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
    })
  }

  /** Reports a failed answer of a C2 step; `commit-unknown` is not a stop, it goes to S4. */
  const reportFailure = (
    ref: SessionRef,
    step: SessionDiagnostic['step'],
    run: RunId | null,
    answer: Outcome<unknown, SessionFailure>,
  ): void => {
    if ('failure' in answer && answer.failure.kind !== 'commit-unknown')
      report(ref, 'C2', step, run, answer.failure.kind, answer.failure)
  }

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

  /**
   * Records the hand-over of one input (SE35). A failure is recorded and does not stop the Run: the
   * pending eligibility of an accepted input ends when the Agent takes it (SE14), not here (PA-01).
   */
  const handOver = async (ref: SessionRef, run: RunId, fact: HandoverFact): Promise<void> => {
    const operation = deriveSessionOperation({ kind: 'fact', fact })
    const answer = await as('coordinator', ref, principal =>
      faces.coordinator.reconciliation.receive({ principal, ...ref, operation, fact }),
    )
    reportFailure(ref, 'receive', run, answer)
    unknownTo(ref, answer, () => handOver(ref, run, fact))
  }

  /**
   * PM-02: the first input refused by the message admission, or an `invoke` that the Agent refused
   * for good, closes the Run with a bounded failure; the first input is rejected in the same batch
   * and is not replayed. `finishRun` carries the Run-layer revision this step read; an unrelated
   * commit does not move it (contract I-R2, R2-D327). When the Run layer moved meanwhile it answers
   * `changed`, and the step reads again and retries up to `command.retriesOnChanged` times, then
   * records a diagnostic.
   */
  const closeRefused = async (
    ref: SessionRef,
    started: StartedRun,
    bounded: Extract<BoundedClose, { kind: 'admission-rejected' | 'drive-refused' }>,
    changes = 0,
  ): Promise<void> => {
    const run = started.advance.run
    const snapshot = await as('coordinator', ref, principal =>
      coordinator.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot) return reportFailure(ref, 'finishRun', run, snapshot)
    if (
      judgeAdvance(snapshot.ok, {
        kind: 'attempt',
        advance: started.advance,
        expected: expectedRevision(snapshot.ok, 'release'),
      }).kind !== 'ok'
    )
      return report(
        ref,
        'C2',
        'finishRun',
        run,
        'advance-withdrawn',
        'the original attempt no longer holds the advance',
      )
    const operation = deriveSessionOperation({ kind: 'bounded-close', run, basis: bounded })
    const request = {
      ...ref,
      operation,
      run,
      expected: expectedRevision(snapshot.ok, 'finishRun'),
      bounded,
    }
    const send = async (): Promise<void> => {
      if (lifecycle.closed) return
      const answer = await as('coordinator', ref, principal =>
        coordinator.finishRun({ principal, ...request }),
      )
      if ('failure' in answer && answer.failure.kind === 'changed') {
        if (changes >= policy.command.retriesOnChanged)
          return report(ref, 'C2', 'finishRun', run, 'retries-exhausted', answer.failure)
        const delays = policy.advance.retryDelaysMs
        const delay = delays[changes] ?? delays.reduce((_, last) => last)
        if (await retryWait(ref, run, delay, 'finishRun', () => stillAdvancing(ref, started)))
          return closeRefused(ref, started, bounded, changes + 1)
        return
      }
      if (!('failure' in answer && answer.failure.kind === 'terminal'))
        reportFailure(ref, 'finishRun', run, answer)
      unknownTo(ref, answer, send)
    }
    return send()
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
   * Whether the advance of this attempt still holds on the current snapshot (SC-01). A failed read
   * comes back as the failure, so the caller can report it.
   */
  const stillAdvancing = async (ref: SessionRef, started: StartedRun): Promise<Holding> => {
    const snapshot = await as('coordinator', ref, principal =>
      coordinator.readWork({ principal, ...ref }),
    )
    if (lifecycle.closed) return false
    if ('failure' in snapshot) return snapshot
    return (
      judgeAdvance(snapshot.ok, {
        kind: 'attempt',
        advance: started.advance,
        expected: expectedRevision(snapshot.ok, 'release'),
      }).kind === 'ok'
    )
  }

  /**
   * Whether `execution` is still the execution of the active Run. A submit needs no advance of an
   * attempt, only the Run it routes the input to (PA-01 item 2).
   */
  const stillRunning = async (ref: SessionRef, execution: string): Promise<Holding> => {
    const snapshot = await as('coordinator', ref, principal =>
      coordinator.readWork({ principal, ...ref }),
    )
    if (lifecycle.closed) return false
    if ('failure' in snapshot) return snapshot
    const { run } = snapshot.ok
    return run.kind === 'active' && run.execution.execution === execution
  }

  const retriable = (failure: DriveFailure): boolean =>
    failure.kind === 'busy' || failure.kind === 'unavailable' || failure.kind === 'commit-unknown'

  /**
   * One backoff wait of `step`: `holds` reads again first, and the wait ends early on a control or
   * terminal notice (`interrupt`). True when the step may send again.
   */
  const retryWait = async (
    ref: SessionRef,
    run: RunId,
    delay: number,
    step: 'invoke' | 'finishRun' | 'submit',
    holds: () => Promise<Holding>,
  ): Promise<boolean> => {
    const key = sessionKey(ref)
    const stop = new AbortController()
    waiting.set(key, stop)
    try {
      const holding = await holds()
      if (typeof holding !== 'boolean') {
        reportFailure(ref, step, run, holding)
        return false
      }
      if (!holding) {
        report(
          ref,
          'C2',
          step,
          run,
          'advance-withdrawn',
          step === 'submit'
            ? 'the execution is no longer the one of the active Run'
            : 'the original attempt no longer holds the advance',
        )
        return false
      }
      const result = await scheduling.wait(delay, stop.signal)
      if (result === 'elapsed') return true
      report(
        ref,
        'C2',
        step,
        run,
        result === 'cancelled' ? 'wait-cancelled' : 'clock-refused',
        'the backoff wait did not elapse',
      )
      return false
    } finally {
      if (waiting.get(key) === stop) waiting.delete(key)
    }
  }

  const submitOnce = async (
    port: AgentDrivePort,
    target: Parameters<AgentDrivePort['submit']>[0],
  ): Promise<Outcome<DriveReceipt, DriveFailure>> => {
    try {
      return await port.submit(target)
    } catch (error) {
      return fail({ kind: 'unavailable', diagnostic: `submit threw: ${messageOf(error)}` })
    }
  }

  /**
   * The outbound submit of one waiting input, with the identity derived from the execution and the
   * input (OP-00), so a retry or a later trigger is recognized by the Agent. An accepted submit is
   * recorded as an accepted hand-over; an admission refusal (`invalid`) as a rejected one (PA-09).
   * `busy`, `unavailable` and an unknown outcome back off by `advance.retryDelaysMs` with the same
   * identity; when the sequence runs out the step records `retries-exhausted` and the input waits
   * for the next trigger. `terminal`: the Run ended first, the input waits for the next Run (PA-03).
   * True when the next waiting input may follow.
   */
  const submit = async (
    ref: SessionRef,
    run: ActiveRun,
    input: InputId,
    source: DurableEvidence,
  ): Promise<boolean> => {
    const { execution } = run.execution
    const operation = deriveDriveOperation({ kind: 'submit', execution, input })
    const target = { ...ref, execution, operation }
    const delays = policy.advance.retryDelaysMs
    const recorded = async (result: HandoverFact['result']): Promise<true> => {
      await handOver(ref, run.run, { kind: 'input-handover', execution, input, result })
      return true
    }
    for (let attempt = 0; ; attempt += 1) {
      if (lifecycle.closed) return false
      const port = drive()
      if (port === null) {
        report(ref, 'C2', 'submit', run.run, 'agent-absent', 'the Agent drive port is absent')
        return false
      }
      const answer = await submitOnce(port, { ...target, input, source })
      if ('ok' in answer) return recorded({ kind: 'accepted', receipt: answer.ok.evidence })
      const failure = answer.failure
      if (failure.kind === 'invalid')
        return recorded({ kind: 'rejected', reason: failure.reason, rejection: failure.rejection })
      if (failure.kind === 'terminal') return false
      const delay = retriable(failure) ? delays[attempt] : undefined
      if (delay === undefined) {
        report(
          ref,
          'C2',
          'submit',
          run.run,
          retriable(failure) ? 'retries-exhausted' : failure.kind,
          failure,
        )
        return false
      }
      if (failure.kind === 'commit-unknown' && (await settled(port, target))) continue
      if (!(await retryWait(ref, run.run, delay, 'submit', () => stillRunning(ref, execution))))
        return false
    }
  }

  /**
   * C2 续入, and the tail of 开 Run (PM-02 item 3): reads the snapshot again in the session lane and
   * submits every waiting input in arrival order. It stops at the first input that cannot be
   * handed in, so a later input never overtakes an earlier one.
   */
  const handIn = async (ref: SessionRef): Promise<void> => {
    const snapshot = await as('coordinator', ref, principal =>
      coordinator.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot) return reportFailure(ref, 'submit', null, snapshot)
    const due = waitingInputs(snapshot.ok)
    if (due === null) return
    for (const input of due.inputs) {
      const source = routedSource(snapshot.ok, input)
      if (source === null)
        return report(
          ref,
          'C2',
          'submit',
          due.run.run,
          'source-unavailable',
          `the snapshot names no routed entry of ${input}`,
        )
      if (!(await submit(ref, due.run, input, source))) return
    }
  }

  /**
   * The outbound invoke with the identity derived from the committed start (OP-00). `busy`,
   * `unavailable` and an unknown outcome back off by `advance.retryDelaysMs`, always with the same
   * identity. When the sequence runs out the step records `retries-exhausted`; the Run stays active
   * with its first input pending, so the next S1 trigger or the S3 scan invokes it again with the
   * same identity (PA-06 item 2). An admission refusal (`invalid`) and a drive refusal (`refused`)
   * close the Run instead (PM-02). Nothing is sent once closed.
   */
  const invoke = async (ref: SessionRef, started: StartedRun): Promise<void> => {
    const run = started.advance.run
    const operation = deriveDriveOperation({
      kind: 'invoke',
      execution: started.execution,
      first: started.first,
      started: started.receipt.source,
    })
    const target = { ...ref, execution: started.execution, operation }
    const delays = policy.advance.retryDelaysMs
    for (let attempt = 0; ; attempt += 1) {
      if (lifecycle.closed) return
      const port = drive()
      if (port === null)
        return report(ref, 'C2', 'invoke', run, 'agent-absent', 'the Agent drive port is absent')
      const holding = await stillAdvancing(ref, started)
      if (typeof holding !== 'boolean') return reportFailure(ref, 'invoke', run, holding)
      if (!holding)
        return report(
          ref,
          'C2',
          'invoke',
          run,
          'advance-withdrawn',
          'the original attempt no longer holds the advance',
        )
      const answer = await invokeOnce(port, {
        ...target,
        first: started.first,
        source: started.receipt.source,
        grant: started.receipt.source,
      })
      if ('ok' in answer) {
        await handOver(ref, run, {
          kind: 'input-handover',
          execution: started.execution,
          input: started.first,
          result: { kind: 'accepted', receipt: answer.ok.evidence },
        })
        return handIn(ref)
      }
      const failure = answer.failure
      if (failure.kind === 'invalid')
        return closeRefused(ref, started, {
          kind: 'admission-rejected',
          input: started.first,
          rejection: failure.rejection,
        })
      if (failure.kind === 'refused')
        return closeRefused(ref, started, {
          kind: 'drive-refused',
          failure: failure.failure,
          field: failure.field,
          reason: failure.reason,
          input: started.first,
        })
      if (failure.kind === 'denied') {
        const again = await stillAdvancing(ref, started)
        if (typeof again !== 'boolean') return reportFailure(ref, 'invoke', run, again)
        if (again) report(ref, 'C2', 'invoke', run, 'denied', failure)
        else
          report(
            ref,
            'C2',
            'invoke',
            run,
            'advance-withdrawn',
            'the original attempt no longer holds the advance',
          )
        return
      }
      const delay = retriable(failure) ? delays[attempt] : undefined
      if (delay === undefined)
        return report(
          ref,
          'C2',
          'invoke',
          run,
          retriable(failure) ? 'retries-exhausted' : failure.kind,
          failure,
        )
      if (failure.kind === 'commit-unknown' && (await settled(port, target))) continue
      if (!(await retryWait(ref, run, delay, 'invoke', () => stillAdvancing(ref, started)))) return
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
    reportFailure(ref, 'freeze', null, answer)
    unknownTo(ref, answer, () => freeze(ref, verdict))
  }

  /** The startRun of (first, predecessor) with the candidate it was or is committed with (OP-00). */
  const start = (
    ref: SessionRef,
    first: InputId,
    predecessor: RunId | null,
    candidate: WorkSnapshot['definition']['adopted'],
  ) =>
    as('coordinator', ref, principal =>
      coordinator.startRun({
        principal,
        ...ref,
        operation: deriveSessionOperation({
          kind: 'startRun',
          session: ref.session,
          first,
          predecessor,
        }),
        entry: 'interactive',
        candidate,
        instance: sessionSlotReference(ref.session, candidate),
      }),
    )

  const openRun = async (
    ref: SessionRef,
    snapshot: WorkSnapshot,
    first: InputId,
  ): Promise<void> => {
    const predecessor = snapshot.run.kind === 'terminal' ? snapshot.run.terminal.run : null
    const started = await start(ref, first, predecessor, snapshot.definition.adopted)
    if ('ok' in started) return invoke(ref, started.ok)
    const failure = started.failure
    if (failure.kind === 'frozen') {
      // With a verdict the adoption brought the freeze; without one the session is frozen already.
      if (failure.verdict !== null) return freeze(ref, failure.verdict)
      return
    }
    // `run-active`: another one opened the Run first, which is harmless (SPEC C2).
    if (failure.kind !== 'run-active') reportFailure(ref, 'startRun', null, started)
    unknownTo(ref, started, () => openRun(ref, snapshot, first))
  }

  /**
   * PA-06 item 2, PM-14: the granted Run is invoked again. The startRun of the Run is recalled with
   * its own OP-00 identity, which gives back the original start, so the invoke carries the same
   * outbound identity, source and grant. It reads the snapshot again first: the session lane may
   * have run another step since S1 read it.
   */
  const replay = async (ref: SessionRef): Promise<void> => {
    const snapshot = await as('coordinator', ref, principal =>
      coordinator.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot) return reportFailure(ref, 'replay', null, snapshot)
    const run = grantedNotInvoked(snapshot.ok)
    if (run === null) return
    const started = await start(ref, run.first, predecessorOf(snapshot.ok, run.run), run.adoption)
    if ('failure' in started) {
      reportFailure(ref, 'replay', run.run, started)
      return unknownTo(ref, started, () => replay(ref))
    }
    // The advance moved to a later attempt (claim, reload): its invoke needs the grant of that
    // attempt, which is the takeover of C5, not in this member yet (SPEC「实现现状」).
    if (run.advance?.attempt !== started.ok.advance.attempt)
      return report(
        ref,
        'C2',
        'replay',
        run.run,
        'attempt-replaced',
        'the granted Run is held by a later attempt; its invoke waits for the takeover (C5)',
      )
    return invoke(ref, started.ok)
  }

  /**
   * S1: read the snapshot and hand the session to C2 when a Run may start, must be invoked again,
   * or has inputs waiting to be handed in.
   */
  const check = async (ref: SessionRef): Promise<void> => {
    const snapshot = await as('maintainer', ref, principal =>
      faces.maintainer.work.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot)
      return report(ref, 'S1', 'read', null, snapshot.failure.kind, snapshot.failure)
    if (grantedNotInvoked(snapshot.ok) !== null)
      return scheduling.serial(sessionKey(ref), () => replay(ref))
    if (waitingInputs(snapshot.ok) !== null)
      return scheduling.serial(sessionKey(ref), () => handIn(ref))
    // A frozen session starts no new Run (I-F2): skip without judging.
    if (snapshot.ok.frozen !== null && snapshot.ok.run.kind !== 'active') return
    const judgment = judgeRunStart(snapshot.ok, 'interactive')
    if (judgment.kind !== 'eligible') return
    const opened = snapshot.ok
    await scheduling.serial(sessionKey(ref), () => openRun(ref, opened, judgment.first))
  }

  const triggers = new Map<string, { again: boolean }>()
  return {
    interrupt: ref => {
      const stop = waiting.get(sessionKey(ref))
      stop?.abort()
      return stop !== undefined
    },
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
