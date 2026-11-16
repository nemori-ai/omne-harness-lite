import { tenantEquals } from '@omne-harness/legal-identity'
import type { SessionReplayFacts, StepCommittedBlocks } from '@omne-harness/session-cordis-contract'
import type {
  AuthorityDecision,
  ContextBlockKey,
  FinishReplayAction,
  HolderDecision,
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
} from '@omne-harness/runtime-context-contract'

export interface RuntimeContextCurrentBridge {
  capture(): Readonly<{ current(): boolean }>
}

export type { SessionReplayFacts, StepCommittedBlocks }

export type SessionRuntimeContextTrustInput<P> = Readonly<{
  authority: RuntimeContextAuthority<P>
  bindings: ScopeBindingSource
  current: RuntimeContextCurrentBridge
  replayFacts: SessionReplayFacts
}>

// Capture the current bridge before the first await, so a revocation during the wait invalidates this answer.
export function createSessionRuntimeContextTrust<P>(
  input: SessionRuntimeContextTrustInput<P>,
): RuntimeContextTrust<P> {
  const { authority, bindings, current, replayFacts } = input

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

  async function uncovered(action: FinishReplayAction): Promise<HolderDecision<P> | undefined> {
    const binding = await bindings.lookup(action.scope)
    if (binding.kind === 'unavailable' || binding.kind === 'unknown') return { kind: binding.kind }
    if (binding.kind !== 'bound' || !tenantEquals(binding.tenant, action.tenant))
      return { kind: 'refused' }
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
