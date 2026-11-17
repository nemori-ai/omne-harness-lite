import type {
  Access,
  Action,
  ActionBatch,
  ActionSlot,
  ActionToolCall,
  AgentCheckpoint,
  AgentExecutionId,
  DurableEvidence,
  Failure,
  FinishCandidate,
  JournalCommitState,
  Preparation,
  ProducedResult,
} from '@omne-harness/agent-contract'
import type { Message } from '@omne-harness/message'
import type * as M from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import type { ContentBlock } from '@omne-harness/content-block'
import type { PassSubject } from './extension-drive.ts'
import type { PassEffect } from './extension-pass.ts'
import {
  afterAuthors,
  batchSubject,
  beforeActionSubjects,
  callsIn,
  closedKeepingRewrites,
  eachSlot,
  failureTrigger,
  single,
  subjects,
} from './extension-positions.ts'
import type { PassOutcome, PassRunner } from './extension-runner.ts'
import type { Label } from './nodes.ts'
import { toolConsumer } from './tools.ts'

type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'toolRequests' | 'models'>
type Saved = Partial<Omit<AgentCheckpoint, 'position'>>

/** Where a position node goes after its pass, and what it saves with the move. */
export type PositionStep = Readonly<{
  on: Label
  commit: Readonly<{ checkpoint?: Saved; state?: JournalCommitState }> | null
}>
type Stepped = Promise<Outcome<PositionStep, Failure>>

export type PositionHost<P> = Readonly<{
  access: Access<P>
  execution: AgentExecutionId
  ports: Ports<P>
  runner: PassRunner
  checkpoint(): AgentCheckpoint
}>

export type Judged = Readonly<{ slot: ActionSlot; candidate: Message; subject: PassSubject | null }>

const go = (on: Label, checkpoint: Saved | null = {}): PositionStep => ({
  on,
  commit: checkpoint === null ? null : { checkpoint },
})

/** The step of a node that adopts its pass in its own commit; `quiet` commits nothing when no member ran. */
export function adopted(passed: PassOutcome, on: Label, quiet = false): PositionStep {
  if (passed.kind === 'left') return passed.step
  return go(on, quiet && passed.effects === null ? null : passed.applied)
}

export function createPositionPasses<P>(host: PositionHost<P>) {
  const { access, execution, ports, runner } = host

  async function toolDefinition(action: Action, original: ActionToolCall) {
    const described = await ports.toolRequests?.describe({
      ...access,
      execution,
      action: action.id,
      original,
      effectiveArguments: action.effectiveArguments,
      consumer: toolConsumer(execution, action),
    })
    if (described === undefined) return succeed(null)
    if ('failure' in described) return described
    return succeed(described.ok.kind === 'tool' ? described.ok.definition : null)
  }

  return {
    async started(conditions: DurableEvidence): Stepped {
      const passed = await runner.run('E3', {
        id: `${host.checkpoint().step}/execution_started`,
        position: 'execution_started',
        dimension: null,
        purpose: null,
        subjects: single({ execution, conditions }),
      })
      return 'failure' in passed ? passed : succeed(adopted(passed.ok, 'passed'))
    },

    // The pass stays open until the request is recorded: its calls name what the request was made from.
    async beforeModel(action: string, preparation: Extract<Preparation, { kind: 'assembled' }>) {
      const passed = await runner.run('P0', {
        id: `${action}/before_model_call`,
        position: 'before_model_call',
        dimension: null,
        purpose: 'main',
        subjects: single({ purpose: 'main', preparation }),
      })
      if ('failure' in passed) return passed
      if (passed.ok.kind === 'left') return succeed({ step: passed.ok.step, effect: null })
      const effect: PassEffect | null = passed.ok.effects?.[0] ?? null
      return succeed({ step: go(effect?.route === 'vetoed' ? 'vetoed' : 'proceed'), effect })
    },

    async afterReply(
      action: string,
      call: M.ModelCallId,
      result: Readonly<{
        produced: ProducedResult
        reply: Message
        settlement: Pick<M.Settlement, 'termination'>
      }>,
    ): Stepped {
      const { produced, reply, settlement } = result
      const subject = { purpose: 'main' as const, call, result: produced, reply }
      const passed = await runner.run('M4', {
        id: `${action}/after_model_call`,
        position: 'after_model_call',
        dimension: { ending: 'complete_reply' },
        purpose: 'main',
        subjects: single({ ...subject, termination: settlement.termination, account: null }),
      })
      return 'failure' in passed ? passed : succeed(adopted(passed.ok, 'proceed', true))
    },

    // The fixed request is held by the process that made the call; no owner reads it back after a takeover.
    async afterFailure(
      action: string,
      call: M.ModelCallId,
      fault: M.ModelFault,
      request: M.FixedModelRequest | null,
      refused: (failure: M.ModelFailure) => Failure,
    ) {
      const read = () => ports.models.calls.dispatches({ ...access, call })
      const before = await read()
      return runner.run('I3', {
        id: `${action}/after_model_call`,
        position: 'after_model_call',
        dimension: { ending: 'failure' },
        purpose: 'main',
        trigger: 'ok' in before ? failureTrigger(before.ok) : 'final',
        async subjects() {
          if (request === null)
            return fail({
              kind: 'unavailable',
              owner: 'agentRequests',
              diagnostic: 'the fixed request of the failed call is not readable after a takeover',
            })
          const dispatches = await read()
          if ('failure' in dispatches) return fail(refused(dispatches.failure))
          const subject = { purpose: 'main' as const, call, request, fault }
          return succeed([
            { action: null, subject: { ...subject, dispatches: dispatches.ok, retry: null } },
          ])
        },
      })
    },

    // `beforePass` records that the batch was judged: a batch passes this position once.
    async beforeActions(
      batch: ActionBatch,
      originals: ReadonlyMap<string, ActionToolCall>,
    ): Promise<Outcome<ActionBatch | PositionStep, Failure>> {
      if (batch.beforePass !== null) return succeed(batch)
      let judged: readonly PassSubject[] = []
      const passed = await runner.run('A0', {
        id: `${batch.id}/before_action`,
        position: 'before_action',
        dimension: null,
        purpose: null,
        async subjects() {
          const found = await beforeActionSubjects(batch, originals, toolDefinition)
          if ('ok' in found) judged = found.ok
          return found
        },
      })
      if ('failure' in passed) return passed
      if (passed.ok.kind === 'left') return succeed(passed.ok.step)
      return succeed(afterAuthors(batch, judged, passed.ok.effects))
    },

    async afterEach(
      batch: ActionBatch,
      judged: readonly Judged[],
      digest: (candidate: Message) => string,
    ): Stepped {
      const each = judged.flatMap(item => item.subject ?? [])
      const first = each[0]
      const ran =
        first === undefined
          ? null
          : await runner.run('T2', {
              id: `${first.action}/after_action`,
              position: 'after_action',
              dimension: { scope: 'each' },
              purpose: null,
              subjects: subjects(each),
            })
      if (ran !== null && 'failure' in ran) return ran
      if (ran?.ok.kind === 'left') return succeed(ran.ok.step)
      const effects = ran?.ok.effects ?? null
      const slots = judged.map(({ slot, candidate, subject }) => {
        const effect = subject === null ? undefined : effects?.[each.indexOf(subject)]
        return eachSlot(slot, candidate, effect, digest)
      })
      const kept = batch.slots.filter(slot => !slots.some(item => item.action === slot.action))
      const next = { ...batch, slots: [...kept, ...slots] }
      return succeed(go('passed', { ...closedKeepingRewrites(host.checkpoint()), batch: next }))
    },

    async afterBatch(batch: ActionBatch): Stepped {
      const passed = await runner.run('T4', {
        id: `${batch.id}/after_action`,
        position: 'after_action',
        dimension: { scope: 'batch' },
        purpose: null,
        subjects: single(batchSubject(batch)),
      })
      if ('failure' in passed) return passed
      if (passed.ok.kind === 'left') return succeed(passed.ok.step)
      const { effects, applied } = passed.ok
      return succeed(
        go('proceed', { ...applied, batch: { ...batch, batchPass: callsIn(effects) } }),
      )
    },

    // A failed stop is not a new candidate when the candidate already fails.
    async beforeTerminal(candidate: FinishCandidate): Stepped {
      const settling: JournalCommitState = { kind: 'settling' }
      const passed = await runner.run('F2', {
        id: `${candidate.candidate}/before_terminal`,
        position: 'before_terminal',
        dimension: null,
        purpose: null,
        subjects: single({ proposed: candidate.conclusion, basis: candidate.origin }),
        ...(candidate.conclusion.kind === 'complete' ? {} : { failedStops: 'ignored' as const }),
      })
      if ('failure' in passed) return passed
      if (passed.ok.kind === 'left') return succeed(passed.ok.step)
      if (passed.ok.effects?.[0]?.route === 'vetoed')
        return succeed({ on: 'vetoed', commit: { state: { kind: 'advancing' } } })
      const { applied } = passed.ok
      const observers = await runner.planObservers(candidate.candidate, {
        ...host.checkpoint(),
        ...applied,
      })
      if ('failure' in observers) return observers
      return succeed({
        on: 'proceed',
        commit: { state: settling, checkpoint: { ...applied, ...observers.ok } },
      })
    },
  }
}
