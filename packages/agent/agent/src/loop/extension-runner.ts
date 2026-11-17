import type {
  Access,
  AgentCheckpoint,
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  Authority,
  CommandReceipt,
  DurableEvidence,
  EnabledExtension,
  ExecutionRevision,
  ExecutionSnapshot,
  Failure,
  HandoffChange,
  HandoffOutcome,
  MessageSource,
  Next,
  PendingHandoff,
} from '@omne-harness/agent-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical } from '../canonical.ts'
import { cancellationOf } from '../control.ts'
import {
  createPassDriver,
  type CardDesk,
  type HumanWait,
  type Pass,
  type PassDriver,
  type PassHost,
} from './extension-drive.ts'
import type { PassEffect } from './extension-pass.ts'
import { conclusionEvidence } from './extension-positions.ts'
import {
  AGENT_OWNER,
  agentEvidence,
  handoffOperation,
  handoffStage,
  journalOperation,
} from './identities.ts'
import type { Label, LoopNode } from './nodes.ts'

type Unavailable = Extract<Failure, { kind: 'unavailable' }>
type Left = Readonly<{ on: Label; commit: null }>
type Reminder = Extract<MessageSource, { kind: 'reminder' }>
type SavedHandoff = ExecutionSnapshot['handoffs'][number]

export type PassOutcome =
  | Readonly<{ kind: 'left'; step: Left }>
  | Readonly<{
      kind: 'ran'
      effects: readonly PassEffect[] | null
      applied: Partial<Pick<AgentCheckpoint, 'chain' | 'passages'>>
    }>

export type PassRunnerHost<P> = Pick<PassHost<P>, 'access' | 'execution' | 'checkpoint'> &
  Readonly<{
    ports: PassHost<P>['ports'] &
      Readonly<{ journal: Pick<AgentJournal<P>, 'recordTerminalObservation'> }>
    definition: readonly EnabledExtension[]
    requestCancel:
      | ((
          input: Access<P> &
            Readonly<{
              execution: AgentExecutionId
              operation: AgentOperationId
              reason: DurableEvidence
            }>,
        ) => Promise<Outcome<CommandReceipt, Failure>>)
      | undefined
    revision(): ExecutionRevision
    authority(): Authority
    snapshot(): ExecutionSnapshot | null
    load(): Promise<Outcome<ExecutionSnapshot, Failure>>
    commit(
      node: LoopNode,
      to: string,
      write: Readonly<{
        checkpoint?: Partial<Omit<AgentCheckpoint, 'position'>>
        handoff?: HandoffChange
        operation?: AgentOperationId
      }>,
    ): Promise<Outcome<void, Failure>>
    waitFor(
      node: LoopNode,
      failure: Unavailable,
      recheck: (() => Promise<Outcome<unknown, Failure>>) | null,
    ): void
    waitForHuman(node: LoopNode, waits: readonly HumanWait[]): void
    cards: CardDesk
    decide(next: Extract<Next, { kind: 'try-finish' }>): void
    handoffOutcome(
      request: PendingHandoff,
      existing: SavedHandoff | undefined,
      node: LoopNode,
    ): Promise<Outcome<HandoffOutcome | 'wait', Failure>>
    resolveHandoff(
      request: PendingHandoff,
      fixed: HandoffOutcome,
      node: LoopNode,
    ): Promise<Outcome<void, Failure>>
  }>

const left = (on: Label): Outcome<PassOutcome, Failure> =>
  succeed({ kind: 'left', step: { on, commit: null } })

type Runner<P> = Readonly<{ host: PassRunnerHost<P>; driver: PassDriver }>

async function run<P>(
  runner: Runner<P>,
  node: LoopNode,
  pass: Pass,
): Promise<Outcome<PassOutcome, Failure>> {
  const ran = await runner.driver.run(node, pass)
  if ('failure' in ran) return ran
  if (ran.ok.kind === 'none') return succeed({ kind: 'ran', effects: null, applied: {} })
  if (ran.ok.kind === 'cancelled') return left('cancel')
  if (ran.ok.kind === 'waiting') {
    runner.host.waitFor(node, ran.ok.failure, ran.ok.recheck)
    return left('wait')
  }
  if (ran.ok.kind === 'human') {
    runner.host.waitForHuman(node, ran.ok.waits)
    return left('wait')
  }
  const { effects, applied } = ran.ok
  for (const inject of effects.flatMap(effect => effect.injects)) {
    const admitted = await admitReminder(runner, node, inject)
    if ('failure' in admitted) return admitted
    if (admitted.ok === 'wait') return left('wait')
  }
  const stops = effects.flatMap(effect => effect.stops)
  const disposed = await disposeStops(
    runner,
    node,
    pass.failedStops === 'ignored'
      ? stops.filter(stop => stop.output.terminal === 'cancelled')
      : stops,
  )
  if ('failure' in disposed) return disposed
  if (disposed.ok !== null) return left(disposed.ok)
  return succeed({ kind: 'ran', effects, applied })
}

async function disposeStops<P>(
  runner: Runner<P>,
  node: LoopNode,
  stops: PassEffect['stops'],
): Promise<Outcome<Label | null, Failure>> {
  for (const stop of stops) {
    if (stop.output.terminal !== 'cancelled' || runner.host.requestCancel === undefined) continue
    const requested = await runner.host.requestCancel({
      ...runner.host.access,
      execution: runner.host.execution,
      operation: journalOperation(node, `stop/${stop.passage}`, null),
      reason: agentEvidence(`${stop.passage}/stop`, stop),
    })
    if ('failure' in requested) {
      if (requested.failure.kind === 'denied') continue
      if (requested.failure.kind !== 'unavailable') return requested
      runner.host.waitFor(node, requested.failure, null)
      return succeed('wait')
    }
    const latest = await runner.host.load()
    if ('failure' in latest) return latest
    if (cancellationOf(latest.ok) !== undefined) return succeed('cancel')
    // Accepted is not in effect: nothing protected goes on until the intent is established.
    runner.host.waitFor(
      node,
      {
        kind: 'unavailable',
        owner: AGENT_OWNER,
        diagnostic: `the cancel request of ${stop.passage} is accepted and not in effect yet`,
      },
      null,
    )
    return succeed('wait')
  }
  const failed = stops.find(stop => stop.output.terminal !== 'cancelled')
  if (failed === undefined) return succeed(null)
  const instant = await runner.host.ports.clock.now()
  if ('failure' in instant) return instant
  const source = agentEvidence(`${failed.passage}/stop`, failed)
  runner.host.decide({
    kind: 'try-finish',
    conclusion: { kind: 'fail', cause: source },
    failure: {
      kind: 'extension-stop',
      passage: failed.passage,
      reason: failed.output.reason,
      step: runner.host.checkpoint().step,
      at: instant.ok,
      source,
    },
  })
  return succeed('try-finish')
}

async function admitReminder<P>(
  runner: Runner<P>,
  node: LoopNode,
  inject: PassEffect['injects'][number],
): Promise<Outcome<'admitted' | 'rejected' | 'wait', Failure>> {
  const source: Reminder = { kind: 'reminder', passage: inject.passage }
  const existing = runner.host
    .snapshot()
    ?.handoffs.find(
      record =>
        record.request.kind === 'execution' &&
        canonical(record.request.source) === canonical(source),
    )
  if (existing !== undefined && existing.history.kind !== 'pending')
    return succeed(existing.history.kind === 'committed' ? 'admitted' : 'rejected')
  const prepared =
    existing?.request.kind === 'execution'
      ? succeed(existing.request)
      : await prepareReminder(runner, node, source, inject.output.message)
  if ('failure' in prepared) return prepared
  const fixed = await runner.host.handoffOutcome(prepared.ok, existing, node)
  if ('failure' in fixed) return fixed
  if (fixed.ok === 'wait') return succeed('wait')
  const resolved = await runner.host.resolveHandoff(prepared.ok, fixed.ok, node)
  if ('failure' in resolved) return resolved
  return succeed(fixed.ok.decision.kind === 'prepared' ? 'admitted' : 'rejected')
}

async function prepareReminder<P>(
  runner: Runner<P>,
  node: LoopNode,
  source: Reminder,
  candidate: PendingHandoff['candidate'],
): Promise<Outcome<PendingHandoff, Failure>> {
  const at = runner.host.checkpoint()
  const predecessor = runner.host.revision()
  const position = { step: at.step, node, slot: source.passage }
  const request: PendingHandoff = {
    kind: 'execution',
    reference: {
      kind: 'execution',
      execution: runner.host.execution,
      operation: handoffOperation(source.kind, position, predecessor),
    },
    predecessor,
    position,
    source,
    candidate,
    originalAdvance: runner.host.authority(),
    predecessorHandoff: null,
  }
  const saved = await runner.host.commit(node, at.position, {
    checkpoint: { currentHandoff: request.reference },
    handoff: { kind: 'prepare', request },
    operation: handoffStage(request.reference.operation, 'prepare'),
  })
  return 'failure' in saved ? saved : succeed(request)
}

async function observeTerminal<P>(
  runner: Runner<P>,
  read: ExecutionSnapshot,
): Promise<Outcome<void, Failure>> {
  if (read.state.kind !== 'ended') return succeed(undefined)
  const subject = { terminal: read.state.conclusion, disposition: read.state.disposition }
  for (const owed of read.terminalObservations) {
    const call = read.checkpoint.passages.find(passage => passage.id === owed.passage)
    if (owed.observed !== null || call === undefined) continue
    const observed = await runner.driver.observe(call, subject)
    if ('failure' in observed) return observed
    if (observed.ok === null) continue
    const recorded = await runner.host.ports.journal.recordTerminalObservation({
      ...runner.host.access,
      execution: runner.host.execution,
      operation: journalOperation('F4', `observe/${owed.passage}`, null),
      terminal: owed.terminal,
      passage: owed.passage,
      implementation: owed.implementation,
      observed: conclusionEvidence(observed.ok),
    })
    if ('failure' in recorded && recorded.failure.kind !== 'unavailable') return recorded
  }
  return succeed(undefined)
}

export function createPassRunner<P>(host: PassRunnerHost<P>) {
  const stopped = new AbortController()
  const cancelled = () => {
    const snapshot = host.snapshot()
    return snapshot !== null && cancellationOf(snapshot) !== undefined
  }
  const driver = createPassDriver<P>({
    access: host.access,
    execution: host.execution,
    ports: host.ports,
    definition: host.definition,
    cards: host.cards,
    checkpoint: host.checkpoint,
    cancelled,
    save: (node, write) => host.commit(node, host.checkpoint().position, write),
    signal: () => stopped.signal,
  })
  const runner: Runner<P> = { host, driver }
  return {
    run: (node: LoopNode, pass: Pass) => run(runner, node, pass),
    planObservers: (candidate: AgentOperationId, at: Pick<AgentCheckpoint, 'passages'>) =>
      driver.planObservers(
        {
          id: `${candidate}/after_terminal`,
          position: 'after_terminal',
          dimension: null,
          purpose: null,
        },
        at,
      ),
    observeTerminal: (read: ExecutionSnapshot) => observeTerminal(runner, read),
    stop: () => stopped.abort(),
  }
}

export type PassRunner = ReturnType<typeof createPassRunner>
