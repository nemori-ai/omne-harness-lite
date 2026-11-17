import type {
  Access,
  ActionId,
  AgentCheckpoint,
  AgentExecutionId,
  EnabledExtension,
  EnabledExtensions,
  ExtensionChain,
  ExtensionImplementations,
  ExtensionInvocationMode,
  ExtensionInvocationResult,
  Failure,
  AgentClock,
  Passage,
  PassageId,
  Subject,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  callsOf,
  chainState,
  closedPass,
  concludeCall,
  effectiveSubject,
  membersAt,
  nextOrdinal,
  reduceChain,
  requestedCall,
  type PassEffect,
  type PassPlace,
} from './extension-pass.ts'
import { agentEvidence } from './identities.ts'
import type { LoopNode } from './nodes.ts'
import { resolve as resolveCall } from './passages.ts'

type Unavailable = Extract<Failure, { kind: 'unavailable' }>

export type Pass = PassPlace &
  Readonly<{
    /** The identity of this pass over the position; a pass that was saved under it is continued, not begun again. */
    id: string
    subject: Subject
    trigger?: 'first-content' | 'final'
    /** The members the system puts at the end of the chain. */
    system?: readonly EnabledExtension[]
  }>

export type PassResult =
  /** No source has a member here: no chain was formed and nothing was saved. */
  | Readonly<{ kind: 'none' }>
  /** The cancellation is in effect: no chain is read and no call begins. */
  | Readonly<{ kind: 'cancelled' }>
  /** A dependency of the pass is not readable or its result is not known; the caller waits and comes back. */
  | Readonly<{
      kind: 'waiting'
      failure: Unavailable
      recheck: () => Promise<Outcome<unknown, Failure>>
    }>
  /** The chain ended. The caller takes the effect and saves `applied` in its own commit. */
  | Readonly<{
      kind: 'ended'
      effect: PassEffect
      applied: Partial<Pick<AgentCheckpoint, 'chain' | 'passages'>>
    }>

type ChainWrite = Readonly<{ checkpoint: Partial<Pick<AgentCheckpoint, 'chain' | 'passages'>> }>

export type PassHost<P> = Readonly<{
  access: Access<P>
  execution: AgentExecutionId
  ports: Readonly<{
    extensions: ExtensionImplementations<P>
    enabledExtensions?: EnabledExtensions<P>
    clock: AgentClock
  }>
  /** The members the definition composed, fixed at the adoption point. */
  definition: readonly EnabledExtension[]
  checkpoint(): AgentCheckpoint
  cancelled(): boolean
  /** Saves at the node the pass runs on; the position does not move. */
  save(node: LoopNode, write: ChainWrite): Promise<Outcome<void, Failure>>
  signal(): AbortSignal
}>

const NO_ROUNDS: ExtensionInvocationMode = { kind: 'fresh' }

export function createPassDriver<P>(host: PassHost<P>) {
  /** The calls this process saved as requested and has not invoked: only those are invoked fresh. */
  const mine = new Set<PassageId>()

  const replaced = (passages: readonly Passage[], next: Passage) =>
    passages.map(passage => (passage.id === next.id ? next : passage))

  /** The tenant's members here; null when the assembly has no tenant source. */
  async function readTenant(pass: Pass) {
    const port = host.ports.enabledExtensions
    if (port === undefined) return null
    return port.read({
      ...host.access,
      execution: host.execution,
      position: pass.position,
      dimension: pass.dimension,
      purpose: pass.purpose,
    })
  }

  /** Reads the tenant's members once and saves the chain with the first requested call, in one commit. */
  async function open(
    node: LoopNode,
    pass: Pass,
  ): Promise<Outcome<ExtensionChain | PassResult, Failure>> {
    if (host.cancelled()) return succeed({ kind: 'cancelled' })
    const read = await readTenant(pass)
    if (read !== null && 'failure' in read) {
      if (read.failure.kind !== 'unavailable') return read
      const recheck = async () => (await readTenant(pass)) ?? succeed(null)
      return succeed({ kind: 'waiting', failure: read.failure, recheck })
    }
    const members = membersAt(pass, {
      definition: host.definition,
      tenant: read === null ? [] : read.ok.members,
      system: pass.system ?? [],
    })
    if (members.length === 0) return succeed({ kind: 'none' })
    const chain: ExtensionChain = {
      pass: pass.id,
      position: pass.position,
      dimension: pass.dimension,
      purpose: pass.purpose,
      members,
      basis: read === null ? null : read.ok.basis,
    }
    const first = requestedCall(chain, 0, null, inputOf(chain, 0, null, pass.subject))
    const saved = await host.save(node, {
      checkpoint: { chain, passages: [...host.checkpoint().passages, first] },
    })
    if ('failure' in saved) return saved
    mine.add(first.id)
    return succeed(chain)
  }

  function inputOf(
    chain: ExtensionChain,
    ordinal: number,
    action: ActionId | null,
    subject: Subject,
  ) {
    return agentEvidence(`${chain.pass}/${action ?? ''}/input/${ordinal}`, subject)
  }

  async function invoke(
    call: Passage,
    subject: Subject,
    earlier: Parameters<typeof effectiveSubject>[1],
    fresh: boolean,
  ): Promise<ExtensionInvocationResult> {
    const resolved = await host.ports.extensions.resolve({ ...host.access, passage: call })
    if ('failure' in resolved) return { kind: 'notStartedUnavailable' }
    const mode: ExtensionInvocationMode = fresh
      ? NO_ROUNDS
      : { kind: 'replay', binding: { passage: call.id, rounds: [], control: 'valid' } }
    return resolved.ok.invoke(
      {
        position: call.position,
        ...(call.dimension === null ? {} : { dimension: call.dimension }),
        subject,
        earlier,
        execution: host.execution,
        passage: call.id,
      },
      host.signal(),
      mode,
    )
  }

  /** Runs the chain of one pass to its end, or to the point where it has to wait. */
  async function run(node: LoopNode, pass: Pass): Promise<Outcome<PassResult, Failure>> {
    let chain = host.checkpoint().chain
    if (chain !== null && chain.pass !== pass.id)
      return fail({
        kind: 'unavailable',
        owner: '@omne-harness/agent#defect',
        diagnostic: `the pass ${pass.id} began while the pass ${chain.pass} is open`,
      })
    if (chain === null) {
      const opened = await open(node, pass)
      if ('failure' in opened) return opened
      if ('kind' in opened.ok) return succeed(opened.ok)
      chain = opened.ok
    }
    for (;;) {
      const passages = host.checkpoint().passages
      const state = chainState(callsOf(chain, passages, null))
      if (state.kind === 'ended') {
        return succeed({
          kind: 'ended',
          effect: reduceChain(pass.subject, state.conclusions),
          applied: closedPass({ chain, passages }),
        })
      }
      if (host.cancelled()) return succeed({ kind: 'cancelled' })
      const { call, earlier } = state
      const fresh = mine.delete(call.id)
      const subject = effectiveSubject(pass.subject, earlier)
      const instant = await host.ports.clock.now()
      if ('failure' in instant) return instant
      const result = await invoke(call, subject, earlier, fresh)
      const concluded = concludeCall(
        call,
        {
          mode: fresh ? 'fresh' : 'replay',
          subject,
          trigger: pass.trigger ?? null,
          at: instant.ok,
        },
        result,
      )
      if (concluded.kind === 'unresolved') {
        const failure: Unavailable = {
          kind: 'unavailable',
          owner: 'agentExtensions',
          diagnostic: `${call.id}: ${concluded.diagnostic}`,
        }
        return succeed({ kind: 'waiting', failure, recheck: async () => succeed(null) })
      }
      if (concluded.kind === 'ask')
        return fail({
          kind: 'unavailable',
          owner: '@omne-harness/agent',
          diagnostic: `${call.id}: a card round of an extension is not handled yet`,
        })
      const evidence = agentEvidence(`${call.id}/conclusion`, concluded.conclusion)
      const resolved = resolveCall(call, concluded.conclusion, evidence)
      if ('failure' in resolved)
        throw new Error(`the call ${call.id} cannot take a conclusion in ${resolved.failure.state}`)
      const next = nextOrdinal(chain, call, concluded.conclusion)
      const following =
        next === null
          ? []
          : [
              requestedCall(
                chain,
                next,
                null,
                inputOf(
                  chain,
                  next,
                  null,
                  effectiveSubject(pass.subject, [...earlier, concluded.conclusion]),
                ),
              ),
            ]
      const saved = await host.save(node, {
        checkpoint: { passages: [...replaced(passages, resolved.ok), ...following] },
      })
      if ('failure' in saved) return saved
      for (const item of following) mine.add(item.id)
    }
  }

  return { run }
}

export type PassDriver = ReturnType<typeof createPassDriver>
