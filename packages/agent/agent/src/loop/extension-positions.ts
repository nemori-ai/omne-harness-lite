import type {
  Access,
  AgentCheckpoint,
  AgentExecutionId,
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
import { createPassDriver, type Pass, type PassHost } from './extension-drive.ts'
import type { PassEffect } from './extension-pass.ts'
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
  /** The pass decided where the loop goes: a wait, a cancellation or a failure candidate. */
  | Readonly<{ kind: 'left'; step: Left }>
  /** The chain ended, or no member applies here. The node adopts `effect` and saves `applied` in its own commit. */
  | Readonly<{
      kind: 'ran'
      effect: PassEffect | null
      applied: Partial<Pick<AgentCheckpoint, 'chain' | 'passages'>>
    }>

/** What the pass runner uses of the coordinator that drives it. */
export type PassRunnerHost<P> = Pick<PassHost<P>, 'access' | 'execution' | 'ports' | 'checkpoint'> &
  Readonly<{
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

/** Runs the extension chain of a pass and disposes the effects that are the same at every position. */
export function createPassRunner<P>(host: PassRunnerHost<P>) {
  const { access, execution } = host
  const stopped = new AbortController()
  const cancelled = () => {
    const snapshot = host.snapshot()
    return snapshot !== null && cancellationOf(snapshot) !== undefined
  }
  const driver = createPassDriver<P>({
    access,
    execution,
    ports: host.ports,
    definition: host.definition,
    checkpoint: host.checkpoint,
    cancelled,
    save: (node, write) => host.commit(node, host.checkpoint().position, write),
    signal: () => stopped.signal,
  })

  async function run(node: LoopNode, pass: Pass): Promise<Outcome<PassOutcome, Failure>> {
    const ran = await driver.run(node, pass)
    if ('failure' in ran) return ran
    if (ran.ok.kind === 'none') return succeed({ kind: 'ran', effect: null, applied: {} })
    if (ran.ok.kind === 'cancelled') return left('cancel')
    if (ran.ok.kind === 'waiting') {
      host.waitFor(node, ran.ok.failure, ran.ok.recheck)
      return left('wait')
    }
    const { effect, applied } = ran.ok
    for (const inject of effect.injects) {
      const admitted = await admitReminder(node, inject)
      if ('failure' in admitted) return admitted
      if (admitted.ok === 'wait') return left('wait')
    }
    const disposed = await disposeStops(node, effect)
    if ('failure' in disposed) return disposed
    if (disposed.ok !== null) return left(disposed.ok)
    return succeed({ kind: 'ran', effect, applied })
  }

  // A cancel request that takes effect has precedence; otherwise the first failed request in chain
  // order becomes the failure candidate. Null: no stop takes effect.
  async function disposeStops(
    node: LoopNode,
    effect: PassEffect,
  ): Promise<Outcome<Label | null, Failure>> {
    for (const stop of effect.stops) {
      if (stop.output.terminal !== 'cancelled' || host.requestCancel === undefined) continue
      const requested = await host.requestCancel({
        ...access,
        execution,
        operation: journalOperation(node, `stop/${stop.passage}`, null),
        reason: agentEvidence(`${stop.passage}/stop`, stop),
      })
      if ('failure' in requested) {
        if (requested.failure.kind === 'denied') continue
        if (requested.failure.kind !== 'unavailable') return requested
        host.waitFor(node, requested.failure, null)
        return succeed('wait')
      }
      const latest = await host.load()
      if ('failure' in latest) return latest
      if (cancellationOf(latest.ok) !== undefined) return succeed('cancel')
      // Accepted is not in effect: nothing protected goes on until the intent is established.
      host.waitFor(
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
    const failed = effect.stops.find(stop => stop.output.terminal !== 'cancelled')
    if (failed === undefined) return succeed(null)
    const instant = await host.ports.clock.now()
    if ('failure' in instant) return instant
    const source = agentEvidence(`${failed.passage}/stop`, failed)
    host.decide({
      kind: 'try-finish',
      conclusion: { kind: 'fail', cause: source },
      failure: {
        kind: 'extension-stop',
        passage: failed.passage,
        reason: failed.output.reason,
        step: host.checkpoint().step,
        at: instant.ok,
        source,
      },
    })
    return succeed('try-finish')
  }

  /** Hands the reminder of one conclusion to message admission once: a saved handoff is continued, not begun again. */
  async function admitReminder(
    node: LoopNode,
    inject: PassEffect['injects'][number],
  ): Promise<Outcome<'admitted' | 'rejected' | 'wait', Failure>> {
    const source: Reminder = { kind: 'reminder', passage: inject.passage }
    const existing = host
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
        : await prepareReminder(node, source, inject.output.message)
    if ('failure' in prepared) return prepared
    const fixed = await host.handoffOutcome(prepared.ok, existing, node)
    if ('failure' in fixed) return fixed
    if (fixed.ok === 'wait') return succeed('wait')
    const resolved = await host.resolveHandoff(prepared.ok, fixed.ok, node)
    if ('failure' in resolved) return resolved
    return succeed(fixed.ok.decision.kind === 'prepared' ? 'admitted' : 'rejected')
  }

  async function prepareReminder(
    node: LoopNode,
    source: Reminder,
    candidate: PendingHandoff['candidate'],
  ): Promise<Outcome<PendingHandoff, Failure>> {
    const at = host.checkpoint()
    const predecessor = host.revision()
    const position = { step: at.step, node, slot: source.passage }
    const request: PendingHandoff = {
      kind: 'execution',
      reference: {
        kind: 'execution',
        execution,
        operation: handoffOperation(source.kind, position, predecessor),
      },
      predecessor,
      position,
      source,
      candidate,
      originalAdvance: host.authority(),
      predecessorHandoff: null,
    }
    const saved = await host.commit(node, at.position, {
      checkpoint: { currentHandoff: request.reference },
      handoff: { kind: 'prepare', request },
      operation: handoffStage(request.reference.operation, 'prepare'),
    })
    return 'failure' in saved ? saved : succeed(request)
  }

  return { run, stop: () => stopped.abort() }
}
