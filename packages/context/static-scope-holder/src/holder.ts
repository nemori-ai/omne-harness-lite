import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  RuntimeContextOperations,
  StaticRegistration,
  StaticScopeFailure,
  StaticScopeHolder,
} from '@omne-harness/runtime-context-contract'
import { DENIED, guarded, unavailable } from './answers.ts'
import { contentOf } from './content.ts'
import { createReading, type Ensured } from './reading.ts'
import { bringUp, newHeld, type Held } from './registering.ts'
import { staticScopeOf } from './scope-ref.ts'

export type StaticScopeHolderDeps<P> = Readonly<{
  kind: string
  runtime: RuntimeContextOperations<P>
  registration: () => StaticRegistration<P>
}>

export function createStaticScopeHolder<P>(deps: StaticScopeHolderDeps<P>): StaticScopeHolder<P> {
  const { kind, runtime } = deps
  const held = new Map<string, Held>()
  const queues = new Map<string, Promise<unknown>>()
  const reading = createReading(runtime)

  // One tenant at a time: two callers that ensure together must not both register.
  function queued<T>(tenant: string, task: () => Promise<T>): Promise<T> {
    const next = (queues.get(tenant) ?? Promise.resolve()).then(task, task)
    queues.set(tenant, next)
    const settled = () => queues.get(tenant) === next && queues.delete(tenant)
    void next.then(settled, settled)
    return next
  }

  async function bring(
    principal: P,
    tenant: TenantId,
  ): Promise<Outcome<Ensured, StaticScopeFailure>> {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) return fail(DENIED)
    const scope = staticScopeOf(kind, tenant)
    const task = async (): Promise<Outcome<Ensured, StaticScopeFailure>> => {
      const content = contentOf(deps.registration() as StaticRegistration)
      if ('failure' in content) return unavailable(content.failure)
      const state = held.get(text.value) ?? newHeld()
      held.set(text.value, state)
      const brought = await bringUp({ runtime, kind, principal, scope, tenant }, state, content.ok)
      return 'failure' in brought ? brought : succeed({ scope, state, content: content.ok })
    }
    return queued(text.value, () => guarded('the static scope holder', task))
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
      const request = { principal, tenant, reader, ensured: ensured.ok }
      return guarded('issueEligibility', () => reading.grant(request))
    },
    async read(principal, tenant, reader) {
      const ensured = await bring(principal, tenant)
      if ('failure' in ensured) return ensured
      const request = { principal, tenant, reader, ensured: ensured.ok }
      return guarded('the read', () => reading.read(request))
    },
  }
}
