import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeScopeRef,
  type ProducerHandle,
  type ProducerRegistration,
  type RegisterProducerResult,
  type ScopeRef,
  type SupplyAnswer,
  type SupplyInput,
} from '@omne-harness/runtime-context-contract'
import type { SessionId } from '@omne-harness/session-contract'
import type { SessionScopeLookup } from '@omne-harness/session-cordis-contract'
import type { SessionModesPublication } from '../mode-publication-schema.ts'
import type { SessionContextHolderInput } from './context-holder.ts'
import { sessionModesDescriptor, sessionModesProducer } from './mode-block.ts'
import type { SessionModesObservation, SessionModesSource } from './mode-source.ts'

type Handle = ProducerHandle<'session.modes'>
type Registration = RegisterProducerResult<'session.modes'>
type Refresh = Readonly<{ kind: 'refreshed' | 'unavailable' | 'refused' | 'closed' }>

export type SessionModesPublisherInput<P> = Readonly<{
  tenant: TenantId
  principal: P
  runtime: {
    registerProducer(
      principal: P,
      input: ProducerRegistration<'session.modes', P>,
    ): Promise<Registration>
  }
  source: SessionModesSource<P>
  scopes: SessionScopeLookup
  coordinator: SessionContextHolderInput<P>['coordinator']
}>

function openScopes(
  observation: Extract<SessionModesObservation, { kind: 'ready' }>,
): ScopeRef[] | undefined {
  const scopes: ScopeRef[] = []
  for (const binding of observation.scopes) {
    if (binding.ended !== null) continue
    const decoded = decodeScopeRef({ ref: binding.scope })
    if ('failure' in decoded) return undefined
    scopes.push(decoded.ok)
  }
  return scopes
}

/** One tenant's adapter lifecycle. Runtime Context owns generations and the actual published state. */
export function createSessionModesPublisher<P>(input: SessionModesPublisherInput<P>) {
  let closed = false
  let handle: Handle | undefined
  let starting: Promise<Registration> | undefined
  let closing: Promise<void> | undefined
  const chains = new Map<SessionId, Promise<void>>()
  const known = new Map<SessionId, readonly ScopeRef[]>()

  function serial<T>(session: SessionId, task: () => Promise<T>): Promise<T> {
    const next = (chains.get(session) ?? Promise.resolve()).then(task)
    const settled = next.then(
      () => undefined,
      () => undefined,
    )
    chains.set(session, settled)
    void settled.then(() => {
      if (chains.get(session) === settled) chains.delete(session)
    })
    return next
  }

  async function invalidate(scopes: readonly ScopeRef[]): Promise<void> {
    if (closed || handle === undefined) return
    for (const scope of scopes) {
      if (closed) return
      await handle.invalidate({ kind: 'scope', scope, tenant: input.tenant })
    }
  }

  async function supply(request: SupplyInput<P>): Promise<SupplyAnswer<SessionModesPublication>> {
    if (closed) return { kind: 'unavailable' }
    if (!tenantEquals(request.tenant, input.tenant)) return { kind: 'refused' }
    const bound = await input.scopes.lookup(request.scope)
    if (bound.kind !== 'known') return { kind: bound.kind }
    if (!tenantEquals(bound.tenant, input.tenant)) return { kind: 'refused' }
    return serial(bound.session, async () => {
      if (closed) return { kind: 'unavailable' }
      const observed = await input.source.read({
        principal: request.principal,
        tenant: input.tenant,
        session: bound.session,
      })
      if (closed) return { kind: 'unavailable' }
      if (observed.kind !== 'ready') return observed
      const scopes = openScopes(observed)
      if (scopes === undefined) return { kind: 'unavailable' }
      if (!scopes.some(scope => scope.ref === request.scope.ref)) return { kind: 'none' }
      known.set(bound.session, scopes)
      return { kind: 'value', value: observed.value }
    })
  }

  async function register(): Promise<Registration> {
    const result = await input.runtime.registerProducer(input.principal, {
      key: 'session.modes',
      tenant: input.tenant,
      producer: sessionModesProducer,
      declaration: sessionModesDescriptor,
      scoped: true,
      supply,
    })
    if (result.kind !== 'registered') return result
    if (closed) {
      await result.handle.dispose()
      return { kind: 'rejected', reason: 'closed' }
    }
    handle = result.handle
    return result
  }

  function start(): Promise<Registration> {
    if (closed) return Promise.resolve({ kind: 'rejected', reason: 'closed' })
    if (handle !== undefined) return Promise.resolve({ kind: 'registered', handle })
    if (starting !== undefined) return starting
    starting = register().finally(() => {
      starting = undefined
    })
    return starting
  }

  async function publish(session: SessionId, observed: SessionModesObservation): Promise<Refresh> {
    if (closed) return { kind: 'closed' }
    if (observed.kind !== 'ready') {
      await invalidate(known.get(session) ?? [])
      return observed
    }
    const scopes = openScopes(observed)
    if (scopes === undefined || handle === undefined) {
      await invalidate(known.get(session) ?? [])
      return { kind: 'unavailable' }
    }
    await invalidate(
      (known.get(session) ?? []).filter(old => !scopes.some(scope => scope.ref === old.ref)),
    )
    if (scopes.length === 0) known.delete(session)
    else known.set(session, scopes)
    for (const scope of scopes) {
      if (closed) return { kind: 'closed' }
      const result = await handle.publish({ scope, tenant: input.tenant, value: observed.value })
      if (result.kind !== 'published') {
        await invalidate(scopes)
        return { kind: 'unavailable' }
      }
    }
    return { kind: 'refreshed' }
  }

  function refresh(session: SessionId): Promise<Refresh> {
    if (closed) return Promise.resolve({ kind: 'closed' })
    return serial(session, async () => {
      if (closed) return { kind: 'closed' }
      try {
        const registered = await start()
        if (registered.kind !== 'registered') return { kind: 'unavailable' }
        const principal = await input.coordinator({ tenant: input.tenant, session })
        const observed =
          'failure' in principal
            ? {
                kind:
                  principal.failure.kind === 'denied'
                    ? ('refused' as const)
                    : ('unavailable' as const),
              }
            : await input.source.read({ principal: principal.ok, tenant: input.tenant, session })
        return await publish(session, observed)
      } catch {
        await invalidate(known.get(session) ?? [])
        return { kind: closed ? 'closed' : 'unavailable' }
      }
    })
  }

  function close(): Promise<void> {
    if (closing !== undefined) return closing
    closed = true
    closing = (async () => {
      await handle?.dispose()
      await starting
      await Promise.all(chains.values())
      known.clear()
    })()
    return closing
  }
  return Object.freeze({ start, refresh, close })
}
