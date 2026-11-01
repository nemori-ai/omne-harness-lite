import type {
  BindResult,
  EligibilityId,
  RuntimeContextOperations,
  RuntimeContextTrust,
  ScopeRef,
  ViewRevision,
} from '@omne-harness/runtime-context-contract'
import { resolveRuntimeContextConfig, type RuntimeContextConfig } from './config.js'
import type { RuntimeContextDiagnostic } from './diagnostics.js'
import { createHolder } from './holder.js'
import { createSupplier } from './producer.js'
import { createReaders, type BindCaller } from './reader.js'
import { createReplay } from './replay.js'
import { createWorld } from './world.js'

export type RuntimeContextOptions<P = unknown> = Readonly<{
  /** The two authority ports. Required: the mechanism has no unchecked mode. */
  trust: RuntimeContextTrust<P>
  /** Bounds; omitted fields take their initial values. */
  config?: RuntimeContextConfig
  /** Called synchronously once per view revision, after the write. A throw is diagnosed; the write stands. */
  onChange?: (scope: ScopeRef, revision: ViewRevision) => void
  /** Receives the closed set of diagnostic events. A throw is ignored. */
  diagnose?: (event: RuntimeContextDiagnostic) => void
}>

/**
 * One mechanism instance: the three faces of the contract plus `close`. `bind` accepts what a Cordis
 * caller declared as an optional second argument; a consumer class that differs from the
 * eligibility, or none at all, is refused with `callerMismatch` after every access check. Without
 * the argument there is no comparison. The instance holds no durable state.
 */
export type RuntimeContextMechanism<P = unknown> = Omit<RuntimeContextOperations<P>, 'bind'> &
  Readonly<{
    bind(eligibility: EligibilityId, caller?: BindCaller): Promise<BindResult>
    /**
     * Refuses new requests, ends every bound reader, cancels the waits in flight, waits for the
     * operations in flight within the settle bound, then releases the tables. Idempotent.
     */
    close(): Promise<void>
  }>

/** The one Runtime Context mechanism factory. It does not depend on Cordis. Throws `RangeError` on an illegal bound. */
export function createRuntimeContext<P = unknown>(
  options: RuntimeContextOptions<P>,
): RuntimeContextMechanism<P> {
  const world = createWorld<P>({
    trust: { authority: options.trust.authority, bindings: options.trust.bindings },
    config: resolveRuntimeContextConfig(options.config),
    onChange: options.onChange,
    diagnose: options.diagnose,
  })
  const supplier = createSupplier(world)
  const holder = createHolder(world, supplier)
  const replay = createReplay(world)
  const readers = createReaders(world, supplier)
  return {
    registerProducer: supplier.registerProducer,
    prepareRegistration: (principal, change) =>
      world.track(holder.prepareRegistration(principal, change)),
    issueEligibility: (principal, material) =>
      world.track(holder.issueEligibility(principal, material)),
    revokeEligibility: (principal, id) => world.track(holder.revokeEligibility(principal, id)),
    applyCommit: (principal, input) => world.track(holder.applyCommit(principal, input)),
    beginReplay: (principal, input) => world.track(replay.beginReplay(principal, input)),
    finishReplay: (principal, input) => world.track(replay.finishReplay(principal, input)),
    bind: readers.bind,
    close: () => world.close(),
  }
}
