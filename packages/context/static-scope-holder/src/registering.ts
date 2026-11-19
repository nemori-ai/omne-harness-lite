import type { TenantId } from '@omne-harness/legal-identity'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  CommitRef,
  ContextBlockKey,
  ProducerHandle,
  RegistrationRevision,
  RuntimeContextOperations,
  ScopeRef,
  StaticBlock,
  StaticScopeFailure,
} from '@omne-harness/runtime-context-contract'
import { refusal } from './answers.ts'
import { chainOf, changeOf, commitOf, stepsBetween, type Content } from './content.ts'

type Producing = Readonly<{ block: StaticBlock; handle: ProducerHandle }>

/** What this process did for one tenant so far. It holds no fact: a new process starts empty. */
export type Held = {
  opened: boolean
  registered: Map<ContextBlockKey, string>
  producing: Map<ContextBlockKey, Producing>
  revision: RegistrationRevision
  head: CommitRef | null
}

export function newHeld(): Held {
  return { opened: false, registered: new Map(), producing: new Map(), revision: 0, head: null }
}

export type Target<P> = Readonly<{
  runtime: RuntimeContextOperations<P>
  kind: string
  principal: P
  scope: ScopeRef
  tenant: TenantId
}>

type Done = Outcome<null, StaticScopeFailure>
const DONE: Done = succeed(null)

// The first registration of this process is the recovery itself: one unit the mechanism finds again.
async function open<P>(at: Target<P>, state: Held, wanted: Content): Promise<Done> {
  if (state.opened) return DONE
  const { runtime, principal, scope, tenant } = at
  const begun = await runtime.beginReplay(principal, {
    scope,
    tenant,
    through: null,
    supersedes: null,
  })
  if (begun.kind !== 'replaying') return refusal('beginReplay', begun)
  const finished = await runtime.finishReplay(principal, {
    replay: begun.replay,
    material: { registrations: chainOf({ scope, tenant }, wanted), checkpoints: [], end: null },
  })
  if (finished.kind !== 'ready') return refusal('finishReplay', finished)
  state.opened = true
  state.revision = finished.registrationRevision
  for (const [key, entry] of wanted) state.registered.set(key, entry.digest)
  return DONE
}

// The holder is the producer of record for a tenant it ensures. It registers after the recovery:
// a producer that was there before the scope is not asked by a read of a recovered registration.
async function produce<P>(at: Target<P>, state: Held, wanted: Content): Promise<Done> {
  for (const [key, producing] of state.producing) {
    if (wanted.get(key)?.block === producing.block) continue
    state.producing.delete(key)
    await producing.handle.dispose()
  }
  for (const [key, { block }] of wanted) {
    if (state.producing.has(key)) continue
    const registered = await at.runtime.registerProducer(at.principal, {
      key,
      tenant: at.tenant,
      producer: { producer: `static-scope:${at.kind}` },
      declaration: block.declaration,
      scoped: false,
      supply: block.supply as StaticBlock<P>['supply'],
    })
    if (registered.kind !== 'registered') return refusal('registerProducer', registered)
    state.producing.set(key, { block, handle: registered.handle })
  }
  return DONE
}

async function register<P>(at: Target<P>, state: Held, wanted: Content): Promise<Done> {
  const { scope, tenant } = at
  for (const step of stepsBetween(state.registered, wanted)) {
    const target = { scope, tenant, head: state.head, revision: state.revision }
    const commit = commitOf(target, step)
    const applied = await at.runtime.applyCommit(at.principal, {
      kind: 'registration',
      commit,
      after: state.head,
      change: changeOf(target, step),
    })
    if (applied.kind !== 'applied') return refusal('applyCommit', applied)
    state.head = commit
    state.revision = applied.registrationRevision
    if (step.kind === 'remove') state.registered.delete(step.key)
    else state.registered.set(step.key, step.entry.digest)
  }
  return DONE
}

/** Brings the scope of one tenant to the wanted content. Each step that is done stays done. */
export async function bringUp<P>(at: Target<P>, state: Held, wanted: Content): Promise<Done> {
  for (const step of [open, produce, register]) {
    const done = await step(at, state, wanted)
    if ('failure' in done) return done
  }
  return DONE
}
