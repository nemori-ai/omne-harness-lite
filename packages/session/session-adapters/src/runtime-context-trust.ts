import type {
  AuthorityDecision,
  CommitRef,
  ContextBlockKey,
  FinishReplayAction,
  HolderDecision,
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'

/**
 * The current bridge of a trusted assembly. `capture()` fixes the valid generations of every source
 * the answer depends on at the moment it is called and returns a view that turns false, once and for
 * all, when any of them is invalidated. The real provider belongs to the application; the
 * synchronous revocation source it needs stays a known gap (#677).
 */
export interface RuntimeContextCurrentBridge {
  capture(): Readonly<{ current(): boolean }>
}

/** What the holder's own durable facts say about the checkpointed blocks of one scope. */
export type StepCommittedBlocks =
  | Readonly<{ kind: 'known'; keys: readonly ContextBlockKey[] }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/**
 * The holder's facts read from the session log. Only a recovery that finishes asks them.
 * `stepCommittedBlocks` answers the keys of the checkpointed blocks of the scope's final
 * registration that have at least one step commit up to `through`. A block that is registered but
 * has no step commit is not listed: it has no value to restore.
 */
export interface SessionReplayFacts {
  stepCommittedBlocks(scope: ScopeRef, through: CommitRef | null): Promise<StepCommittedBlocks>
}

/** Every port is required. There is no default that allows. */
export type SessionRuntimeContextTrustInput<P> = Readonly<{
  authority: RuntimeContextAuthority<P>
  bindings: ScopeBindingSource
  current: RuntimeContextCurrentBridge
  replayFacts: SessionReplayFacts
}>

/**
 * Builds the two ports a trusted assembly hands to Runtime Context from the original authority, the
 * original trusted binding source, a current bridge and the holder's session facts.
 *
 * It is a composition adapter and issues no second authorization. For every call it captures the
 * bridge before the first await, asks the original authority and keeps the original branch. An
 * authorized answer stays current only while the original `current()` and the captured view hold.
 * The binding source passes through unchanged.
 *
 * The one check of its own is the coverage of a finished recovery: the holder authority answers
 * `replay-incomplete` when the material leaves out a block that already has a step commit. It reads
 * the holder facts only for a scope the trusted bindings assign to the action's tenant.
 */
export function createSessionRuntimeContextTrust<P>(
  input: SessionRuntimeContextTrustInput<P>,
): RuntimeContextTrust<P> {
  const { authority, bindings, current, replayFacts } = input

  /** Captures before the caller's first await; the view keeps its own receiver. */
  function capture(): () => boolean {
    const captured = current.capture()
    return () => captured.current()
  }

  function bridged<D extends AuthorityDecision<P> | HolderDecision<P>>(
    decision: D,
    live: () => boolean,
  ): D {
    if (decision.kind !== 'authorized') return decision
    const original = decision.current
    return { ...decision, current: () => original() && live() }
  }

  /** The verdict that replaces the authorized answer, or `undefined` when the recovery is covered. */
  async function uncovered(action: FinishReplayAction): Promise<HolderDecision<P> | undefined> {
    const binding = await bindings.lookup(action.scope)
    if (binding.kind === 'unavailable' || binding.kind === 'unknown') return { kind: binding.kind }
    if (binding.kind !== 'bound' || binding.tenant !== action.tenant) return { kind: 'refused' }
    const facts = await replayFacts.stepCommittedBlocks(action.scope, action.through)
    if (facts.kind !== 'known') return { kind: facts.kind }
    const restored = new Set<ContextBlockKey>(
      action.material.checkpoints.flatMap(group => group.blocks.map(block => block.key)),
    )
    return facts.keys.every(key => restored.has(key))
      ? undefined
      : { kind: 'invalid', reason: 'replay-incomplete' }
  }

  return {
    authority: {
      async holder(principal, action) {
        const live = capture()
        const decision = bridged(await authority.holder(principal, action), live)
        if (decision.kind !== 'authorized' || action.kind !== 'finish-replay') return decision
        const verdict = await uncovered(action)
        // A stale answer goes back as it is: the caller refuses it, and learns nothing of the facts.
        return verdict === undefined || !decision.current() ? decision : verdict
      },
      async producer(principal, action) {
        const live = capture()
        return bridged(await authority.producer(principal, action), live)
      },
      async reader(principal, eligibility) {
        const live = capture()
        return bridged(await authority.reader(principal, eligibility), live)
      },
    },
    bindings,
  }
}
