// The trace replay driver of the `./testing` entry (AG-23): it replays the behaviors that the TLC
// simulation of verification/models/Finishing.tla exported onto an `AgentJournal` built by a core
// fixture, one Journal call per model step, and checks after each step that the Journal answered
// what the model answered and that its state projects onto the model's state. The model, its
// bounds and the mapping of each step are in verification/formal-mapping.md.
//
// A trace that conforms to the model passes on a Journal that keeps the finishing protocol inside
// the mapped steps. A violating trace, the shortest behavior of a negative control, must fail at
// its last step: there the model under a deliberate fault answers what the protocol forbids.
// Passing traces support, they do not prove, that a Journal refines the model.
import { AssertionError } from 'node:assert/strict'
import type { Outcome } from '@omne-harness/operation-result'
import type { Failure } from './evaluation.ts'
import type { ExecutionSnapshot, FinishAuthorization, FinishIntent } from './execution.ts'
import type { AgentOperationId, Authority } from './identity.ts'
import type { PendingHandoff } from './passages.ts'
import type { ConformanceCase } from './testing-case.ts'
import {
  advancement,
  cancelAuthorization,
  cancelControl,
  candidateContent,
  commitAt,
  f1Commit,
  f2Commit,
  failedContent,
  installationOf,
  load,
  newSubmit,
  ok,
  operation,
  pendingHandoff,
  prepareCommit,
  prepared,
  resolveCommit,
  settlement,
  stage,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpened,
} from './testing-journal-helpers.ts'

/** The projection of a Journal's state that the model's state determines. */
export type JournalReplayState = Readonly<{
  status: 'advancing' | 'settling' | 'ended'
  conclusion: 'none' | 'complete' | 'failed' | 'cancelled'
  route: 'none' | 'author' | 'cancellation'
  /** Whether `checkpoint.currentHandoff` names an H. */
  handoff: boolean
}>

/** One model step: the action, the model's answer and the model's state after it. */
export type JournalReplayStep = Readonly<{
  action: string
  reply: string
  state: JournalReplayState
}>

/** One behavior of the model; `origin` names the configuration and the run that exported it. */
export type JournalReplayTrace = Readonly<{
  name: string
  origin: string
  steps: readonly JournalReplayStep[]
}>

/** What a performer observed of one step. */
export type JournalReplayObservation = Readonly<{ reply: string; state: JournalReplayState }>

/** The first step of a trace whose observation is not the step's. */
export class JournalReplayMismatch extends AssertionError {
  readonly step: number

  constructor(trace: JournalReplayTrace, step: number, observed: JournalReplayObservation) {
    const expected = trace.steps[step]
    super({
      message:
        `trace ${trace.name} (${trace.origin}), step ${step} ${expected?.action ?? '?'}: ` +
        `the model expects ${JSON.stringify({ reply: expected?.reply, state: expected?.state })}, ` +
        `the Journal gave ${JSON.stringify(observed)}`,
      actual: observed,
      expected:
        expected === undefined ? undefined : { reply: expected.reply, state: expected.state },
    })
    this.step = step
  }
}

/**
 * Performs the steps of `trace` in order and fails with a JournalReplayMismatch at the first step
 * whose observed reply or state differs from the step. No later step is performed.
 */
export async function checkJournalTrace(
  trace: JournalReplayTrace,
  perform: (step: JournalReplayStep, index: number) => Promise<JournalReplayObservation>,
): Promise<void> {
  for (const [index, step] of trace.steps.entries()) {
    const observed = await perform(step, index)
    if (!sameObservation(observed, step)) throw new JournalReplayMismatch(trace, index, observed)
  }
}

function sameObservation(observed: JournalReplayObservation, step: JournalReplayStep): boolean {
  return (
    observed.reply === step.reply &&
    observed.state.status === step.state.status &&
    observed.state.conclusion === step.state.conclusion &&
    observed.state.route === step.state.route &&
    observed.state.handoff === step.state.handoff
  )
}

/** Replays `trace` on a new execution of `fixture`; fails with a JournalReplayMismatch. */
export async function replayJournalTrace<P>(
  fixture: AgentJournalCoreFixture<P>,
  trace: JournalReplayTrace,
): Promise<void> {
  const opened = await fixture.open(`replay-${trace.name}`)
  await checkJournalTrace(trace, await journalPerformer(opened, trace.name))
}

/**
 * The replay cases of a Journal: each conforming trace passes, and each violating trace fails at
 * its last step, the step that the protocol forbids.
 */
export function agentJournalReplayConformance<P>(
  fixture: AgentJournalCoreFixture<P>,
  traces: Readonly<{
    conforming: readonly JournalReplayTrace[]
    violating: readonly JournalReplayTrace[]
  }> = { conforming: agentJournalReplayTraces, violating: agentJournalViolatingTraces },
): readonly ConformanceCase[] {
  return [
    ...traces.conforming.map(trace => ({
      name: `replay ${trace.name} (${trace.origin}): every step answers and projects as the model`,
      run: () => replayJournalTrace(fixture, trace),
    })),
    ...traces.violating.map(trace => ({
      name: `replay ${trace.name} (${trace.origin}): the forbidden last step is reported`,
      run: async () => {
        const outcome = await replayJournalTrace(fixture, trace).then(
          () => undefined,
          (error: unknown) => error,
        )
        if (!(outcome instanceof JournalReplayMismatch)) {
          throw new AssertionError({
            message: `the violating trace ${trace.name} should fail at its last step, got ${String(outcome)}`,
          })
        }
        if (outcome.step !== trace.steps.length - 1) {
          throw new AssertionError({
            message: `the violating trace ${trace.name} failed at step ${outcome.step}, not at its last step: ${outcome.message}`,
          })
        }
      },
    })),
  ]
}

// ------------------------------------------------------------------------------------------
// The performer: one Journal call per model step (formal-mapping.md, "回放映射").

type Reply<T> = Promise<Outcome<T, Failure>>
type Produced<P> = Awaited<ReturnType<NonNullable<AgentJournalCoreOpened<P>['produceResult']>>>

/** What the coordinator of a replay holds between steps. */
type Coordinator<P> = {
  /** The snapshot of the last load or own successful write: the model's view. */
  view: ExecutionSnapshot
  /** The last intent the view showed while settling. */
  intent: FinishIntent | null
  authority: Authority
  /** The attachment a takeover superseded. */
  superseded: Authority | null
  control: AgentOperationId | null
  request: PendingHandoff | null
  produced: Produced<P> | null
  /** The call whose reply was lost, retried as it was. */
  lost: (() => Reply<unknown>) | null
}

async function journalPerformer<P>(
  opened: AgentJournalCoreOpened<P>,
  traceName: string,
): Promise<(step: JournalReplayStep, index: number) => Promise<JournalReplayObservation>> {
  const { journal, access, execution } = opened
  const view = await load(opened)
  const c: Coordinator<P> = {
    view,
    intent: view.state.kind === 'settling' ? view.state.intent : null,
    authority: opened.authority,
    superseded: null,
    control: null,
    request: null,
    produced: null,
    lost: null,
  }
  const reload = async (c: Coordinator<P>): Promise<void> => {
    c.view = await load(opened)
    if (c.view.state.kind === 'settling') c.intent = c.view.state.intent
  }
  const control = (c: Coordinator<P>) => required(c.control, 'the cancel control')
  const authorization = (c: Coordinator<P>): FinishAuthorization =>
    c.view.settlement.candidate?.conclusion.kind === 'cancelled'
      ? cancelAuthorization(c.view, control(c))
      : advancement(c.authority)
  const candidate = (c: Coordinator<P>) =>
    required(c.view.settlement.candidate, 'a candidate in the view').candidate
  const prepareRequest = (c: Coordinator<P>, name: string) => ({
    ...access,
    execution,
    operation: operation(name),
    authorization: authorization(c),
    expected: c.view.revision,
    candidate: candidate(c),
  })
  const finishRequest = (c: Coordinator<P>, name: string) => ({
    ...access,
    execution,
    operation: operation(name),
    authorization: authorization(c),
    expected: c.view.revision,
    intent: required(c.intent, 'an intent'),
  })
  const judgeRequest = (c: Coordinator<P>, name: string) => {
    const route = c.view.settlement.route
    if (route === null || route.kind !== 'cancellation')
      throw new Error('the view should carry a cancellation route')
    return settlement<P, 'judge-cancellation'>(opened, name, {
      kind: 'judge-cancellation',
      authorization: cancelAuthorization(c.view, control(c)),
      expected: c.view.revision,
      candidate: candidate(c),
      route: route.record,
      installation: installationOf(opened).record,
    })
  }

  return async (step, index) => {
    const name = `${traceName}-${index}`
    /**
     * An own write at the view. A write that establishes facts moves the view to the new
     * revision; a tryFinish that answers changed or blocked writes nothing.
     */
    const own = async (reply: Reply<unknown>): Promise<string> => {
      const answer = replyOf(await reply)
      if (answer === 'ok' || answer === 'ended') await reload(c)
      return answer
    }
    /** The write with its reply lost: the provider applies it and answers commit-unknown. */
    const lose = async (
      method: 'tryFinish' | 'prepareFinish' | 'commitSettlement',
      call: () => Reply<unknown>,
    ): Promise<string> => {
      required(opened.faultNext, 'the faultNext control')(method, 'applied')
      c.lost = call
      return replyOf(await call())
    }
    const perform = async (): Promise<string> => {
      switch (step.action) {
        case 'Load':
          await reload(c)
          return 'ok'
        case 'TakeInputs': {
          const taken = await ok(
            journal.inputs({ ...access, execution, watermark: c.view.inputWatermark }),
            'inputs',
          )
          return own(
            journal.commit(
              commitAt(opened, c.view, name, c.authority, {
                checkpoint: { ...c.view.checkpoint, inputBatch: taken.batch.id },
                events: [{ kind: 'input-taken', batch: taken.batch }],
              }),
            ),
          )
        }
        case 'F1-complete':
        case 'F1-failed': {
          const content = candidateContent(
            c.view,
            name,
            step.action === 'F1-failed' ? failedContent(name) : {},
          )
          return own(journal.commit(f1Commit(opened, c.view, name, c.authority, content)))
        }
        case 'F2':
          return own(journal.commit(f2Commit(opened, c.view, name, c.authority)))
        case 'Prepare':
          return own(journal.prepareFinish(prepareRequest(c, name)))
        case 'Lose-Prepare': {
          const request = prepareRequest(c, name)
          return lose('prepareFinish', () => journal.prepareFinish(request))
        }
        case 'TryFinish':
          return own(journal.tryFinish(finishRequest(c, name)))
        case 'Lose-TryFinish': {
          const request = finishRequest(c, name)
          return lose('tryFinish', () => journal.tryFinish(request))
        }
        case 'Establish':
          return own(
            journal.commitSettlement(
              settlement<P, 'establish-cancellation'>(opened, name, {
                kind: 'establish-cancellation',
                authorization: cancelAuthorization(c.view, control(c)),
                expected: c.view.revision,
                installation: installationOf(opened).record,
                predecessor: c.view.settlement.candidate?.candidate ?? null,
              }),
            ),
          )
        case 'Judge':
          return own(journal.commitSettlement(judgeRequest(c, name)))
        case 'Lose-Judge': {
          const request = judgeRequest(c, name)
          return lose('commitSettlement', () => journal.commitSettlement(request))
        }
        case 'Retry-TryFinish':
        case 'Retry-Prepare':
        case 'Retry-Judge': {
          const call = required(c.lost, 'a lost call')
          c.lost = null
          return replyOf(await call())
        }
        case 'Cancel': {
          const request = cancelControl(opened, name)
          c.control = request.operation
          return replyOf(await journal.control(request))
        }
        case 'Intent-reached':
        case 'Intent-unresolved':
        case 'Intent-late': {
          const which = step.action === 'Intent-unresolved' ? 'unresolved' : 'reached'
          return replyOf(
            await journal.recordControl(
              stage(opened, name, control(c), 'intent-established', which),
            ),
          )
        }
        case 'Submit': {
          const value = await opened.acceptInput(name)
          return replyOf(await journal.submit(newSubmit(opened, name, value)))
        }
        case 'Effect': {
          c.produced = await required(opened.produceResult, 'the produceResult control')(name)
          await reload(c)
          return 'ok'
        }
        case 'Produce':
        case 'Provider-prepared-h1':
          // The producer and the admission provider act outside the Journal.
          return 'ok'
        case 'RecordNone':
        case 'Custody': {
          const produced = required(c.produced, 'a produced result')
          return replyOf(
            await journal.recordResult({
              ...access,
              execution,
              operation: operation(name),
              result: produced.result,
              consumption: produced.consumption,
              transfer: step.action === 'Custody' ? produced.transfer : { kind: 'none' },
              release: { kind: 'pending' },
            }),
          )
        }
        case 'P-h1': {
          // The request and the commit carry the current attachment, also after a takeover.
          const request = { ...pendingHandoff(opened, c.view, name), originalAdvance: c.authority }
          c.request = request
          const commit = prepareCommit(opened, c.view, name, request)
          return own(journal.commit({ ...commit, authority: c.authority }))
        }
        case 'Ja-h1': {
          const outcome = prepared(required(c.request, 'the request of P'))
          const commit = resolveCommit(opened, c.view, name, outcome)
          return own(journal.commit({ ...commit, authority: c.authority }))
        }
        case 'Takeover': {
          c.superseded = c.authority
          c.authority = await required(opened.takeover, 'the takeover control')(name)
          return 'ok'
        }
        case 'StaleWrite': {
          const superseded = required(c.superseded, 'a superseded attachment')
          return replyOf(await journal.commit(commitAt(opened, c.view, name, superseded)))
        }
        default:
          throw new Error(`the replay driver maps no Journal call to the model step ${step.action}`)
      }
    }
    const reply = await perform()
    return { reply, state: projectionOf(await load(opened)) }
  }
}

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined)
    throw new Error(`the replay step needs ${what}, which no earlier step provided`)
  return value
}

/** The model's name of a Journal answer. */
function replyOf(outcome: Outcome<unknown, Failure>): string {
  if ('failure' in outcome)
    return outcome.failure.kind === 'changed' ? 'failure-changed' : outcome.failure.kind
  const value = outcome.ok
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    if (value.kind === 'ended' || value.kind === 'changed') return value.kind
    if (value.kind === 'blocked' && 'reason' in value) return `blocked-${String(value.reason)}`
  }
  return 'ok'
}

/** The model state that a snapshot projects onto. */
function projectionOf(snapshot: ExecutionSnapshot): JournalReplayState {
  const kind = snapshot.state.kind
  const conclusion = snapshot.settlement.candidate?.conclusion.kind
  return {
    // The model does not tell reconciling from advancing.
    status: kind === 'settling' || kind === 'ended' ? kind : 'advancing',
    conclusion: conclusion === undefined ? 'none' : conclusion === 'fail' ? 'failed' : conclusion,
    route: snapshot.settlement.route?.kind ?? 'none',
    handoff: snapshot.checkpoint.currentHandoff !== null,
  }
}

// ------------------------------------------------------------------------------------------
// The traces, generated: `run.py traces` writes verification/models/finishing-traces.json, and
// the self-test of this package checks that these constants equal that file.

const STATUSES: readonly JournalReplayState['status'][] = ['advancing', 'settling', 'ended']
const CONCLUSIONS: readonly JournalReplayState['conclusion'][] = [
  'none',
  'complete',
  'failed',
  'cancelled',
]
const ROUTES: readonly JournalReplayState['route'][] = ['none', 'author', 'cancellation']

function oneOf<T extends string>(values: readonly T[], text: string | undefined): T | undefined {
  return values.find(value => value === text)
}

/** One generated trace; each step reads 'action reply status conclusion route handoff'. */
function trace(name: string, origin: string, steps: readonly string[]): JournalReplayTrace {
  return { name, origin, steps: steps.map(decodeStep) }
}

function decodeStep(text: string): JournalReplayStep {
  const [action, reply, statusText, conclusionText, routeText, handoff, ...rest] = text.split(' ')
  const status = oneOf(STATUSES, statusText)
  const conclusion = oneOf(CONCLUSIONS, conclusionText)
  const route = oneOf(ROUTES, routeText)
  if (
    action === undefined ||
    reply === undefined ||
    status === undefined ||
    conclusion === undefined ||
    route === undefined ||
    (handoff !== 'handoff' && handoff !== '-') ||
    rest.length > 0
  )
    throw new Error(`a generated replay step is malformed: ${text}`)
  return { action, reply, state: { status, conclusion, route, handoff: handoff === 'handoff' } }
}

// ---8<--- generated traces
// Written by verification/models/run.py traces from finishing-traces.json. A step reads
// 'action reply status conclusion route handoff', with '-' when no H is current.
export const agentJournalReplayTraces: readonly JournalReplayTrace[] = [
  trace('ordinary-1', 'trace-ordinary.cfg simulate seed 11', [
    'TakeInputs ok advancing none none -',
    'F1-failed ok settling failed author -',
    'Prepare ok settling failed author -',
    'F2 ok settling failed author -',
    'Lose-TryFinish commit-unknown ended failed author -',
  ]),
  trace('ordinary-2', 'trace-ordinary.cfg simulate seed 12', [
    'F1-complete ok settling complete author -',
    'TakeInputs ok advancing complete author -',
    'P-h1 ok advancing complete author handoff',
    'F1-failed ok settling failed author handoff',
    'Takeover ok advancing failed author handoff',
    'Load ok advancing failed author handoff',
    'F2 ok settling failed author handoff',
    'Prepare ok settling failed author handoff',
    'TryFinish ended ended failed author handoff',
  ]),
  trace('ordinary-3', 'trace-ordinary.cfg simulate seed 13', [
    'Takeover ok advancing none none -',
    'Submit ok advancing none none -',
    'F1-complete failure-changed advancing none none -',
    'Load ok advancing none none -',
    'TakeInputs ok advancing none none -',
    'F1-failed ok settling failed author -',
    'F2 ok settling failed author -',
    'Prepare ok settling failed author -',
    'Lose-TryFinish commit-unknown ended failed author -',
  ]),
  trace('complete-1', 'trace-complete.cfg simulate seed 31', [
    'F1-failed ok settling failed author -',
    'TakeInputs ok advancing failed author -',
    'Submit ok advancing failed author -',
    'P-h1 failure-changed advancing failed author -',
    'Load ok advancing failed author -',
    'TakeInputs ok advancing failed author -',
    'F1-complete ok settling complete author -',
    'Takeover ok advancing complete author -',
    'TryFinish changed advancing complete author -',
    'F2 failure-changed advancing complete author -',
    'Load ok advancing complete author -',
    'F2 ok settling complete author -',
    'Prepare ok settling complete author -',
    'Lose-TryFinish commit-unknown ended complete author -',
  ]),
  trace('complete-2', 'trace-complete.cfg simulate seed 32', [
    'TakeInputs ok advancing none none -',
    'Takeover ok advancing none none -',
    'P-h1 failure-changed advancing none none -',
    'Load ok advancing none none -',
    'F1-complete ok settling complete author -',
    'StaleWrite stale-advance settling complete author -',
    'F2 ok settling complete author -',
    'Prepare ok settling complete author -',
    'Lose-TryFinish commit-unknown ended complete author -',
  ]),
  trace('cancelled-1', 'trace-cancelled.cfg simulate seed 21', [
    'Takeover ok advancing none none -',
    'F1-failed failure-changed advancing none none -',
    'F1-complete failure-changed advancing none none -',
    'F1-failed failure-changed advancing none none -',
    'StaleWrite stale-advance advancing none none -',
    'Load ok advancing none none -',
    'F1-failed ok settling failed author -',
    'TakeInputs ok advancing failed author -',
    'TryFinish changed advancing failed author -',
    'Effect ok advancing failed author -',
    'F2 ok settling failed author -',
    'Prepare ok settling failed author -',
    'Produce ok settling failed author -',
    'TryFinish unavailable settling failed author -',
    'Prepare ok settling failed author -',
    'Lose-Prepare commit-unknown settling failed author -',
    'Submit ok settling failed author -',
    'StaleWrite stale-advance settling failed author -',
    'RecordNone ok settling failed author -',
    'StaleWrite stale-advance settling failed author -',
    'Cancel ok settling failed author -',
    'StaleWrite stale-advance settling failed author -',
    'Retry-Prepare ok settling failed author -',
    'Custody ok settling failed author -',
    'TryFinish changed settling failed author -',
    'StaleWrite stale-advance settling failed author -',
    'TryFinish changed settling failed author -',
    'Intent-unresolved ok settling failed author -',
    'Prepare failure-changed settling failed author -',
    'Intent-reached ok settling failed author -',
    'Prepare failure-changed settling failed author -',
    'StaleWrite stale-advance settling failed author -',
    'Prepare failure-changed settling failed author -',
    'StaleWrite stale-advance settling failed author -',
    'Load ok settling failed author -',
    'Prepare failure-changed settling failed author -',
    'TryFinish changed settling failed author -',
    'Establish ok settling cancelled cancellation -',
    'Judge ok settling cancelled cancellation -',
    'Prepare ok settling cancelled cancellation -',
    'TryFinish ended ended cancelled cancellation -',
  ]),
  trace('cancelled-2', 'trace-cancelled.cfg simulate seed 22', [
    'P-h1 ok advancing none none handoff',
    'TakeInputs ok advancing none none handoff',
    'Provider-prepared-h1 ok advancing none none handoff',
    'Cancel ok advancing none none handoff',
    'Submit ok advancing none none handoff',
    'Ja-h1 failure-changed advancing none none handoff',
    'TakeInputs failure-changed advancing none none handoff',
    'F1-failed failure-changed advancing none none handoff',
    'Intent-unresolved ok advancing none none handoff',
    'Load ok advancing none none handoff',
    'Ja-h1 ok advancing none none -',
    'Effect ok advancing none none -',
    'Takeover ok advancing none none -',
    'TakeInputs failure-changed advancing none none -',
    'F1-failed failure-changed advancing none none -',
    'Produce ok advancing none none -',
    'Intent-reached ok advancing none none -',
    'Load ok advancing none none -',
    'RecordNone ok advancing none none -',
    'Establish failure-changed advancing none none -',
    'F1-failed failure-changed advancing none none -',
    'Custody ok advancing none none -',
    'Establish failure-changed advancing none none -',
    'F1-failed failure-changed advancing none none -',
    'F1-complete failure-changed advancing none none -',
    'Establish failure-changed advancing none none -',
    'Load ok advancing none none -',
    'Establish ok settling cancelled cancellation -',
    'StaleWrite stale-advance settling cancelled cancellation -',
    'Lose-Judge commit-unknown settling cancelled cancellation -',
    'Retry-Judge ok settling cancelled cancellation -',
    'Load ok settling cancelled cancellation -',
    'Prepare ok settling cancelled cancellation -',
    'StaleWrite stale-advance settling cancelled cancellation -',
    'TryFinish ended ended cancelled cancellation -',
  ]),
  trace('cancelled-3', 'trace-cancelled.cfg simulate seed 23', [
    'TakeInputs ok advancing none none -',
    'F1-failed ok settling failed author -',
    'Cancel ok settling failed author -',
    'Takeover ok advancing failed author -',
    'Submit ok advancing failed author -',
    'F2 failure-changed advancing failed author -',
    'F1-complete failure-changed advancing failed author -',
    'P-h1 failure-changed advancing failed author -',
    'Intent-reached ok advancing failed author -',
    'Load ok advancing failed author -',
    'StaleWrite stale-advance advancing failed author -',
    'Establish ok settling cancelled cancellation -',
    'Lose-Judge commit-unknown settling cancelled cancellation -',
    'Retry-Judge ok settling cancelled cancellation -',
    'StaleWrite stale-advance settling cancelled cancellation -',
    'Load ok settling cancelled cancellation -',
    'Judge ok settling cancelled cancellation -',
    'TryFinish invalid settling cancelled cancellation -',
    'Prepare ok settling cancelled cancellation -',
    'Judge ok settling cancelled cancellation -',
    'StaleWrite stale-advance settling cancelled cancellation -',
    'Prepare ok settling cancelled cancellation -',
    'TryFinish ended ended cancelled cancellation -',
  ]),
]

export const agentJournalViolatingTraces: readonly JournalReplayTrace[] = [
  trace('skip-pending', 'trace-bad-skip-pending.cfg counterexample of NoEndWithPending', [
    'F1-complete ok settling complete author -',
    'F2 ok settling complete author -',
    'Prepare ok settling complete author -',
    'TryFinish ended ended complete author -',
  ]),
  trace(
    'unknown-as-pending',
    'trace-bad-unknown-as-pending.cfg counterexample of UnknownNotBlockedOrEnded',
    [
      'TakeInputs ok advancing none none -',
      'Effect ok advancing none none -',
      'F1-complete ok settling complete author -',
      'Prepare ok settling complete author -',
      'TryFinish blocked-operations settling complete author -',
    ],
  ),
  trace(
    'recheck-before-recognize',
    'trace-bad-recheck-before-recognize.cfg counterexample of ReplayOriginal',
    [
      'TakeInputs ok advancing none none -',
      'F1-complete ok settling complete author -',
      'Lose-Prepare commit-unknown settling complete author -',
      'Retry-Prepare failure-changed settling complete author -',
    ],
  ),
]
