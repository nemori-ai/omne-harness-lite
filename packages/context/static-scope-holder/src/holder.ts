import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeScopeRef,
  type CommitRef,
  type ContextBlockKey,
  type HolderOperations,
  type NeedBindingRef,
  type RegistrationRevision,
  type ScopeRef,
  type StaticReaderRequest,
  type StaticRegistration,
  type StaticScopeFailure,
  type StaticScopeHolder,
} from '@omne-harness/runtime-context-contract'
import { chainOf, changeOf, commitOf, contentOf, stepsBetween, type Content } from './content.ts'

const PREFIX = 'static-scope:'

function prefixOf(kind: string): string {
  return `${PREFIX}${kind}:`
}

export function staticScopeOf(kind: string, tenant: TenantId): ScopeRef {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('a static scope requires a minted tenant')
  const decoded = decodeScopeRef({ ref: prefixOf(kind) + text.value })
  if (!('ok' in decoded)) throw new TypeError('a static scope requires a kind')
  return decoded.ok
}

export function staticScopeTenant(kind: string, scope: ScopeRef): TenantId | undefined {
  const prefix = prefixOf(kind)
  if (!scope.ref.startsWith(prefix)) return undefined
  const parsed = tenantCodec.parse(scope.ref.slice(prefix.length))
  if (!parsed.ok) return undefined
  return staticScopeOf(kind, parsed.value).ref === scope.ref ? parsed.value : undefined
}

export type StaticScopeHolderDeps<P> = Readonly<{
  kind: string
  runtime: HolderOperations<P>
  registration: () => StaticRegistration
}>

type Held = {
  opened: boolean
  registered: Map<ContextBlockKey, string>
  revision: RegistrationRevision
  head: CommitRef | null
}

type Answer = Readonly<{ kind: string; reason?: string; cause?: string }>

const DENIED: StaticScopeFailure = Object.freeze({ kind: 'denied' })

function unavailable(diagnostic: string): Outcome<never, StaticScopeFailure> {
  return fail({ kind: 'unavailable', diagnostic })
}

function refusal(operation: string, answer: Answer): Outcome<never, StaticScopeFailure> {
  if (answer.kind === 'refused' && answer.reason === 'unauthorized') return fail(DENIED)
  return unavailable(`${operation} answered ${answer.kind}:${answer.reason ?? answer.cause ?? ''}`)
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'a thrown value that is not an error'
}

export function createStaticScopeHolder<P>(deps: StaticScopeHolderDeps<P>): StaticScopeHolder<P> {
  const { kind, runtime } = deps
  const held = new Map<string, Held>()
  const queues = new Map<string, Promise<unknown>>()

  // The first registration of this process is the recovery itself: one unit the mechanism finds again.
  async function open(
    principal: P,
    scope: ScopeRef,
    tenant: TenantId,
    state: Held,
    wanted: Content,
  ): Promise<Outcome<null, StaticScopeFailure>> {
    if (state.opened) return succeed(null)
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
    if (finished.state !== 'open') return unavailable('the static scope has ended')
    state.opened = true
    state.revision = finished.registrationRevision
    for (const [key, entry] of wanted) state.registered.set(key, entry.digest)
    return succeed(null)
  }

  async function register(
    principal: P,
    scope: ScopeRef,
    tenant: TenantId,
    state: Held,
    wanted: Content,
  ): Promise<Outcome<null, StaticScopeFailure>> {
    for (const step of stepsBetween(state.registered, wanted)) {
      const target = { scope, tenant, head: state.head, revision: state.revision }
      const commit = commitOf(target, step)
      const applied = await runtime.applyCommit(principal, {
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
    return succeed(null)
  }

  // One tenant at a time: two callers that ensure together must not both register.
  function queued<T>(tenant: string, task: () => Promise<T>): Promise<T> {
    const next = (queues.get(tenant) ?? Promise.resolve()).then(task, task)
    queues.set(tenant, next)
    void next.then(
      () => queues.get(tenant) === next && queues.delete(tenant),
      () => queues.get(tenant) === next && queues.delete(tenant),
    )
    return next
  }

  type Ensured = Readonly<{ scope: ScopeRef; state: Held; content: Content }>

  async function bring(
    principal: P,
    tenant: TenantId,
  ): Promise<Outcome<Ensured, StaticScopeFailure>> {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) return fail(DENIED)
    const scope = staticScopeOf(kind, tenant)
    return queued(text.value, async () => {
      try {
        const content = contentOf(deps.registration())
        if ('failure' in content) return unavailable(content.failure)
        const state = held.get(text.value) ?? {
          opened: false,
          registered: new Map(),
          revision: 0,
          head: null,
        }
        held.set(text.value, state)
        const opened = await open(principal, scope, tenant, state, content.ok)
        if ('failure' in opened) return opened
        const registered = await register(principal, scope, tenant, state, content.ok)
        if ('failure' in registered) return registered
        return succeed({ scope, state, content: content.ok })
      } catch (cause) {
        return unavailable(`the static scope holder threw: ${describe(cause)}`)
      }
    })
  }

  function readableBy(content: Content, reader: StaticReaderRequest) {
    const keys = new Set(reader.blocks.filter(key => content.has(key)))
    const bindings: NeedBindingRef[] = []
    const bound = new Set<string>()
    for (const [key, entry] of content)
      for (const { need, translate } of entry.bindings) {
        if (!reader.needs.includes(need.name) || need.consumer !== reader.consumer) continue
        bound.add(need.name)
        if (translate === undefined) keys.add(key)
        else bindings.push({ need: need.name, key })
      }
    const missing = {
      blocks: reader.blocks.filter(key => !content.has(key)),
      needs: reader.needs.filter(name => !bound.has(name)),
    }
    return { material: { keys: [...keys], bindings }, missing }
  }

  return {
    scopeOf: tenant => staticScopeOf(kind, tenant),
    async ensure(principal, tenant) {
      const ensured = await bring(principal, tenant)
      return 'failure' in ensured ? ensured : succeed(ensured.ok.scope)
    },
    async issue(principal, tenant, reader) {
      const ensured = await bring(principal, tenant)
      if ('failure' in ensured) return ensured
      const { scope, state, content } = ensured.ok
      const { material, missing } = readableBy(content, reader)
      try {
        const issued = await runtime.issueEligibility(principal, {
          supersedes: null,
          scope,
          consumer: reader.consumer,
          principal,
          tenant,
          ...material,
          registrationRevision: state.revision,
        })
        return issued.kind === 'issued'
          ? succeed({ eligibility: issued.eligibility.id, missing })
          : refusal('issueEligibility', issued)
      } catch (cause) {
        return unavailable(`issueEligibility threw: ${describe(cause)}`)
      }
    },
  }
}
