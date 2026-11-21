import { MAX_DISPATCH_DEPTH, type DispatchMode } from './values.ts'

export type AcceptRefusal =
  | 'not-permitted'
  | 'dispatcher-archived'
  | 'unknown-agent'
  | 'agent-not-master'
  | 'too-deep'
  | 'too-many-open'
  | 'context-unavailable'
  | 'conflict'

/** What is known when a dispatch is asked for. Each fact has its own owner; this only judges. */
export type AcceptFacts = Readonly<{
  mode: DispatchMode
  permitted: boolean
  dispatcher: Readonly<{ depth: number; archived: boolean }>
  /** The type of the target definition as the tenant sees it now, or null when it sees none. */
  agentType: 'master' | 'non-master' | null
  /** How many dispatches of the dispatching session are accepted or started. */
  open: number
  maxOpen: number
  /** Whether the moment of the dispatching call to fork the session at is known. Only `spawn` needs it. */
  contextCopy: 'given' | 'none'
}>

export type AcceptDecision =
  | Readonly<{ kind: 'accept' }>
  | Readonly<{ kind: 'refuse'; reason: AcceptRefusal }>

const refuse = (reason: AcceptRefusal): AcceptDecision => ({ kind: 'refuse', reason })

const CHECKS: readonly (readonly [(facts: AcceptFacts) => boolean, AcceptRefusal])[] = [
  [facts => !facts.permitted, 'not-permitted'],
  [facts => facts.dispatcher.archived, 'dispatcher-archived'],
  [facts => facts.agentType === null, 'unknown-agent'],
  [facts => facts.mode === 'handoff' && facts.agentType !== 'master', 'agent-not-master'],
  [facts => facts.mode !== 'handoff' && facts.dispatcher.depth >= MAX_DISPATCH_DEPTH, 'too-deep'],
  [facts => facts.open >= facts.maxOpen, 'too-many-open'],
  [facts => facts.mode === 'spawn' && facts.contextCopy === 'none', 'context-unavailable'],
]

/** A request that does not hold when it is asked for is refused with the first reason that fits. */
export function decideAccept(facts: AcceptFacts): AcceptDecision {
  const failed = CHECKS.find(([fails]) => fails(facts))
  return failed === undefined ? { kind: 'accept' } : refuse(failed[1])
}
