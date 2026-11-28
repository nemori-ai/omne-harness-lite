import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  heldBack,
  deriveDriveOperation,
  deriveSessionOperation,
  expectedRevision,
  judgeAdvance,
  judgeRunStart,
  runIdOf,
  type AgentDrivePort,
  type AdvanceRef,
  type BoundedClose,
  type DriveFailure,
  type DriveReceipt,
  type AdoptionNote,
  type DurableEvidence,
  type FreezeVerdict,
  type InputId,
  type ProducerFact,
  type RunAdoption,
  type RunId,
  type SessionFaces,
  type SessionFailure,
  type StartAdoption,
  type StartedRun,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import type { SessionDiagnostic } from './diagnostics.ts'
import { messageOf, type DriveRefusal } from './failures.ts'
import { handedRun, type KnownHandovers } from './known-handovers.ts'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import type { Resolution } from './resolution.ts'
import { sessionKey, type Actor, type Scheduling, type SessionRef } from './scheduling.ts'
import { sessionSlotReference } from './slot-reference.ts'

export type Advance = Readonly<{
  trigger(ref: SessionRef): void
  interrupt(ref: SessionRef): boolean
  closeRefused(ref: SessionRef, advance: AdvanceRef, refusal: DriveRefusal): Promise<void>
}>

type Advancing = Pick<StartedRun, 'advance'>

const driveRefused = (
  { failure, field, reason }: DriveRefusal,
  inputs: readonly InputId[],
): Extract<BoundedClose, { kind: 'drive-refused' }> => ({
  kind: 'drive-refused',
  failure,
  field,
  reason,
  inputs,
})

type Faces<P> = Readonly<Record<Actor, SessionFaces<P>>>

type ActiveRun = Extract<WorkSnapshot['run'], { kind: 'active' }>

type HandoverFact = Extract<ProducerFact, { kind: 'input-handover' }>

type Holding = boolean | Readonly<{ failure: SessionFailure }>

function grantedNotInvoked(snapshot: WorkSnapshot, known: ReadonlySet<InputId>): ActiveRun | null {
  const { run } = snapshot
  if (run.kind !== 'active' || run.advance === null) return null
  return handedRun(snapshot, known) === null ? run : null
}

function waitingInputs(
  snapshot: WorkSnapshot,
  known: ReadonlySet<InputId>,
): Readonly<{ run: ActiveRun; inputs: readonly InputId[] }> | null {
  const { run } = snapshot
  if (run.kind !== 'active' || run.advance === null) return null
  const handed = new Set([...snapshot.handed, ...known, ...heldBack(snapshot)])
  const inputs = snapshot.pending.filter(
    input => !run.initial.includes(input) && !handed.has(input),
  )
  return inputs.length === 0 ? null : { run, inputs }
}

export type AdvanceStep =
  | Readonly<{ kind: 'replay'; run: ActiveRun }>
  | Readonly<{ kind: 'hand-in'; run: ActiveRun; inputs: readonly InputId[] }>
  | Readonly<{ kind: 'open'; opener: InputId }>
  | Readonly<{ kind: 'none' }>

export function advanceStep(snapshot: WorkSnapshot, known: ReadonlySet<InputId>): AdvanceStep {
  const granted = grantedNotInvoked(snapshot, known)
  if (granted !== null) return { kind: 'replay', run: granted }
  const waiting = waitingInputs(snapshot, known)
  if (waiting !== null) return { kind: 'hand-in', ...waiting }
  const judgment = judgeRunStart(snapshot, 'interactive')
  return judgment.kind === 'eligible'
    ? { kind: 'open', opener: judgment.initial[0] }
    : { kind: 'none' }
}

const acceptedHandovers = (
  execution: string,
  inputs: readonly InputId[],
  receipt: DurableEvidence,
): HandoverFact[] =>
  inputs.map(input => ({
    kind: 'input-handover',
    execution,
    input,
    result: { kind: 'accepted', receipt },
  }))

function routedSource(snapshot: WorkSnapshot, input: InputId): DurableEvidence | null {
  return snapshot.historyIndex?.inputs.find(item => item.input === input)?.source ?? null
}

function predecessorOf(snapshot: WorkSnapshot, run: RunId): RunId | null {
  const executions = snapshot.executions ?? []
  const at = executions.findIndex(item => item.run === run)
  return at > 0 ? (executions[at - 1]?.run ?? null) : null
}

async function invokeOnce(
  port: AgentDrivePort,
  target: Parameters<AgentDrivePort['invoke']>[0],
): Promise<Outcome<DriveReceipt, DriveFailure>> {
  try {
    return await port.invoke(target)
  } catch (error) {
    return fail({ kind: 'unavailable', diagnostic: `invoke threw: ${messageOf(error)}` })
  }
}

async function settled(
  port: AgentDrivePort,
  target: Parameters<AgentDrivePort['query']>[0],
): Promise<boolean> {
  try {
    const answer = await port.query(target)
    return 'ok' in answer && answer.ok !== 'unknown'
  } catch {
    return false
  }
}

async function submitOnce(
  port: AgentDrivePort,
  target: Parameters<AgentDrivePort['submit']>[0],
): Promise<Outcome<DriveReceipt, DriveFailure>> {
  try {
    return await port.submit(target)
  } catch (error) {
    return fail({ kind: 'unavailable', diagnostic: `submit threw: ${messageOf(error)}` })
  }
}

type As<P> = <T>(
  actor: Actor,
  ref: SessionRef,
  operation: (principal: P) => Promise<Outcome<T, SessionFailure>>,
) => Promise<Outcome<T, SessionFailure>>

/** How a run is started, and what it adopts: asked of the adoption source at that moment, the version in force then. */
function runStarts<P>(
  dependencies: SessionDependencies<P>,
  coordinator: SessionFaces<P>['work'],
  as: As<P>,
  refused: (ref: SessionRef, failure: Outcome<unknown, SessionFailure>) => void,
) {
  const start = async (
    ref: SessionRef,
    first: InputId,
    predecessor: RunId | null,
    { candidate, residentAdoption, note }: Starting,
  ): Promise<Outcome<StartedRun, SessionFailure>> => {
    const answer = await as('coordinator', ref, principal =>
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
        ...(residentAdoption === undefined ? {} : { residentAdoption }),
        ...(note === undefined ? {} : { note }),
      }),
    )
    // A start that names no wait begins a run: the answer of one that only noted a wait is not this one.
    return 'ok' in answer && 'noted' in answer.ok
      ? fail(NOT_STARTED)
      : (answer as Outcome<StartedRun, SessionFailure>)
  }
  // A run that waits notes why once for its first input: the same reason again is the same note.
  const wait = (ref: SessionRef, work: WorkSnapshot, first: InputId, reason: string) =>
    as('coordinator', ref, principal =>
      coordinator.startRun({
        principal,
        ...ref,
        operation: deriveSessionOperation({
          kind: 'adoption-note',
          session: ref.session,
          first,
          reason,
        }),
        entry: 'interactive',
        candidate: work.definition.adopted,
        instance: sessionSlotReference(ref.session, work.definition.adopted),
        note: { kind: 'waiting', reason },
      }),
    )
  const adoptionFor = async (
    ref: SessionRef,
    work: WorkSnapshot,
    first: InputId,
    predecessor: RunId | null,
  ): Promise<Outcome<RunAdoption, SessionFailure>> => {
    const pinned = { ok: { kind: 'adopt' as const, candidate: work.definition.adopted } }
    const { evidence } = dependencies
    if (evidence.runAdoption === undefined) return pinned
    const run = runIdOf(work.session, first, predecessor)
    return as(
      'coordinator',
      ref,
      async principal =>
        (await evidence.runAdoption?.({ principal, ...ref }, { work, run })) ?? pinned,
    )
  }
  /** Starts on what the adoption source answers; with no usable adoption it notes the wait instead. */
  const begin = async (
    ref: SessionRef,
    work: WorkSnapshot,
    first: InputId,
    predecessor: RunId | null,
  ) => {
    const adoption = await adoptionFor(ref, work, first, predecessor)
    if ('failure' in adoption) return { started: adoption, unanswered: true }
    const started =
      adoption.ok.kind === 'none'
        ? await wait(ref, work, first, adoption.ok.reason)
        : await start(ref, first, predecessor, startingOf(work, adoption.ok))
    return { started, unanswered: false }
  }
  const noteWait = async (
    ref: SessionRef,
    work: WorkSnapshot,
    first: InputId,
    failure: SessionFailure,
  ) => refused(ref, await wait(ref, work, first, waitingFor(failure)))
  return { start, begin, noteWait }
}

const NOT_STARTED: SessionFailure = Object.freeze({
  kind: 'unavailable',
  owner: 'session',
  diagnostic: 'the run start only noted a wait',
})

const waitingFor = (failure: SessionFailure): string =>
  `the adoption cannot be had now: ${'diagnostic' in failure ? failure.diagnostic : failure.kind}`

type Starting = Readonly<{
  candidate: StartedRun['adopted']
  residentAdoption?: StartAdoption
  note?: AdoptionNote
}>

/** What a run starts on: the set adopted now, or the one the session stands at with why the new one is not used. */
function startingOf(
  work: WorkSnapshot,
  adoption: Exclude<RunAdoption, { kind: 'none' }>,
): Starting {
  if (adoption.kind === 'keep')
    return { candidate: work.definition.adopted, note: { kind: 'kept', reason: adoption.reason } }
  const { candidate, residentAdoption } = adoption
  return { candidate, ...(residentAdoption === undefined ? {} : { residentAdoption }) }
}

export function createAdvance<P>(
  input: Readonly<{
    dependencies: SessionDependencies<P>
    lifecycle: Lifecycle
    policy: SchedulingPolicy
    scheduling: Scheduling<P>
    resolution: Resolution
    faces: Faces<P>
    known: KnownHandovers
    recover: (ref: SessionRef) => void
  }>,
): Advance {
  const { dependencies, lifecycle, policy, scheduling, resolution, faces, known, recover } = input
  const coordinator = faces.coordinator.work
  const waiting = new Map<string, AbortController>()

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

  const reportFailure = (
    ref: SessionRef,
    step: SessionDiagnostic['step'],
    run: RunId | null,
    answer: Outcome<unknown, SessionFailure>,
  ): void => {
    if ('failure' in answer && answer.failure.kind !== 'commit-unknown')
      report(ref, 'C2', step, run, answer.failure.kind, answer.failure)
  }

  const as = async <T>(
    actor: Actor,
    ref: SessionRef,
    operation: (principal: P) => Promise<Outcome<T, SessionFailure>>,
  ): Promise<Outcome<T, SessionFailure>> => {
    const principal = await scheduling.principal(actor, ref)
    if ('failure' in principal) return fail(principal.failure)
    return operation(principal.ok)
  }

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

  const handOver = async (ref: SessionRef, run: RunId, fact: HandoverFact): Promise<void> => {
    const operation = deriveSessionOperation({ kind: 'fact', fact })
    const answer = await as('coordinator', ref, principal =>
      faces.coordinator.reconciliation.receive({ principal, ...ref, operation, fact }),
    )
    reportFailure(ref, 'receive', run, answer)
    unknownTo(ref, answer, () => handOver(ref, run, fact))
  }

  const handOverAll = async (ref: SessionRef, run: RunId, facts: readonly HandoverFact[]) => {
    for (const fact of facts) await handOver(ref, run, fact)
  }

  const closeRefused = async (
    ref: SessionRef,
    started: Advancing,
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

  const stillAdvancing = async (ref: SessionRef, started: Advancing): Promise<Holding> => {
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

  const retryWait = async (
    ref: SessionRef,
    run: RunId | null,
    delay: number,
    step: 'invoke' | 'finishRun' | 'submit' | 'startRun',
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
      known.note(ref, run.run, [input])
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

  const handIn = async (ref: SessionRef): Promise<void> => {
    const snapshot = await as('coordinator', ref, principal =>
      coordinator.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot) return reportFailure(ref, 'submit', null, snapshot)
    const due = waitingInputs(snapshot.ok, known.of(ref, snapshot.ok))
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

  const invoke = async (ref: SessionRef, started: StartedRun, replay = false): Promise<void> => {
    const run = started.advance.run
    const { execution, initial } = started
    const source = started.receipt.source
    const operation = deriveDriveOperation({ kind: 'invoke', execution, initial, started: source })
    const target = { ...ref, execution, operation }
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
      const answer = await invokeOnce(port, { ...target, initial, source, grant: source })
      if ('ok' in answer) {
        known.note(ref, run, initial)
        await handOverAll(ref, run, acceptedHandovers(execution, initial, answer.ok.evidence))
        if (replay) recover(ref)
        return handIn(ref)
      }
      const failure = answer.failure
      if (failure.kind === 'invalid')
        return closeRefused(ref, started, {
          kind: 'admission-rejected',
          input: failure.input,
          rejection: failure.rejection,
        })
      if (failure.kind === 'refused')
        return closeRefused(ref, started, driveRefused(failure, initial))
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

  const { start, begin, noteWait } = runStarts(dependencies, coordinator, as, (ref, answer) =>
    reportFailure(ref, 'startRun', null, answer),
  )

  // A Run that cannot start yet for a passing reason (its predecessor not read through, a moved
  // revision) is tried again after each configured delay, judged again on a fresh read.
  const openRun = async (ref: SessionRef, opened: WorkSnapshot, opener: InputId): Promise<void> => {
    const delays = policy.advance.retryDelaysMs
    let snapshot = opened
    let first = opener
    for (let attempt = 0; ; attempt += 1) {
      const predecessor = snapshot.run.kind === 'terminal' ? snapshot.run.terminal.run : null
      const { started, unanswered } = await begin(ref, snapshot, first, predecessor)
      if ('ok' in started) return 'noted' in started.ok ? undefined : invoke(ref, started.ok)
      const failure = started.failure
      if (failure.kind === 'frozen')
        return failure.verdict === null ? undefined : freeze(ref, failure.verdict)
      if (failure.kind === 'unavailable' || failure.kind === 'changed') {
        const delay = delays[attempt]
        if (delay === undefined) {
          report(ref, 'C2', 'startRun', null, 'retries-exhausted', failure)
          return unanswered ? noteWait(ref, snapshot, first, failure) : undefined
        }
        if (!(await retryWait(ref, null, delay, 'startRun', () => Promise.resolve(true)))) return
        const fresh = await as('coordinator', ref, principal =>
          coordinator.readWork({ principal, ...ref }),
        )
        if ('failure' in fresh) return reportFailure(ref, 'startRun', null, fresh)
        const judgment = judgeRunStart(fresh.ok, 'interactive')
        if (judgment.kind !== 'eligible') return
        snapshot = fresh.ok
        first = judgment.initial[0]
        continue
      }
      if (failure.kind !== 'run-active') reportFailure(ref, 'startRun', null, started)
      return unknownTo(ref, started, () => openRun(ref, snapshot, first))
    }
  }

  const replay = async (ref: SessionRef): Promise<void> => {
    const snapshot = await as('coordinator', ref, principal =>
      coordinator.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot) return reportFailure(ref, 'replay', null, snapshot)
    const run = grantedNotInvoked(snapshot.ok, known.of(ref, snapshot.ok))
    if (run === null) return
    const started = await start(ref, run.initial[0], predecessorOf(snapshot.ok, run.run), {
      candidate: run.adoption,
    })
    if ('failure' in started) {
      reportFailure(ref, 'replay', run.run, started)
      return unknownTo(ref, started, () => replay(ref))
    }
    if (run.advance?.attempt !== started.ok.advance.attempt) {
      known.note(ref, run.run, run.initial)
      recover(ref)
      return report(ref, 'C2', 'replay', run.run, 'attempt-replaced', 'held by a later attempt')
    }
    return invoke(ref, started.ok, true)
  }

  const check = async (ref: SessionRef): Promise<void> => {
    const snapshot = await as('maintainer', ref, principal =>
      faces.maintainer.work.readWork({ principal, ...ref }),
    )
    if ('failure' in snapshot)
      return report(ref, 'S1', 'read', null, snapshot.failure.kind, snapshot.failure)
    const opened = snapshot.ok
    const step = advanceStep(opened, known.of(ref, opened))
    if (step.kind === 'replay') return scheduling.serial(sessionKey(ref), () => replay(ref))
    if (step.kind === 'hand-in') return scheduling.serial(sessionKey(ref), () => handIn(ref))
    if (step.kind === 'open')
      return scheduling.serial(sessionKey(ref), () => openRun(ref, opened, step.opener))
  }

  const triggers = new Map<string, { again: boolean }>()
  return {
    interrupt: ref => {
      const stop = waiting.get(sessionKey(ref))
      stop?.abort()
      return stop !== undefined
    },
    closeRefused: (ref, advance, refusal) =>
      closeRefused(ref, { advance }, driveRefused(refusal, [])),
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
