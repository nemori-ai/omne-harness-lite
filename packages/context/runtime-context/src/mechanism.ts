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
  trust: RuntimeContextTrust<P>
  config?: RuntimeContextConfig
  onChange?: (scope: ScopeRef, revision: ViewRevision) => void
  diagnose?: (event: RuntimeContextDiagnostic) => void
}>

export type RuntimeContextMechanism<P = unknown> = Omit<RuntimeContextOperations<P>, 'bind'> &
  Readonly<{
    bind(eligibility: EligibilityId, caller?: BindCaller): Promise<BindResult>
    close(): Promise<void>
  }>

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
