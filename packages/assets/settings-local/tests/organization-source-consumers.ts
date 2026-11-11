import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createIdentityQualifiedSettingsPreparation,
  createIdentityQualifiedSettingsSources,
  type SettingsSourceRequest,
  type SettingsSourceDestination,
} from '../src/preparation.ts'
import { openPreparedServiceWorld } from './prepared-service-world.ts'
import type { openOrganizationCurrentWorld } from './organization-current-world.ts'
import { equal } from '../src/encoding.ts'
export async function connectOrganizationConsumers(
  w: Awaited<ReturnType<typeof openOrganizationCurrentWorld>>,
) {
  const routes: {
    domain: SettingsSourceRequest['destination']['identity']['domain']
    destination: SettingsSourceDestination
  }[] = []
  const sources = createIdentityQualifiedSettingsSources({
    identity: { verifier: w.identity.authority.verifier, standing: w.identity.identity.standing },
    backend: {
      storage: w.world.storage,
      domain: w.domain,
      registration: w.sourceRegistration,
      access: {
        async authorize(principal, request) {
          return {
            kind: 'authorized',
            scope: w.domain.scope,
            target: request.source.target,
            principalRef: standingPrincipalRef(principal),
          }
        },
      },
      destination: {
        recognize: request =>
          routes
            .find(route => equal(route.domain, request.destination.identity.domain))
            ?.destination.recognize(request) ?? Promise.resolve({ kind: 'unavailable' }),
        seal: request =>
          routes
            .find(route => equal(route.domain, request.destination.identity.domain))
            ?.destination.seal(request) ?? Promise.resolve({ kind: 'unavailable' }),
      },
    },
  })
  const consumers: {
    target: Awaited<ReturnType<typeof openPreparedServiceWorld>>
    backend: ReturnType<typeof createIdentityQualifiedSettingsPreparation>
    principal: ActingForTenantPrincipal
    scopeRef: string
  }[] = []
  for (const principal of [w.principal, w.identity.principal]) {
    const encoded = tenantCodec.encode(principal.tenant)
    if (!encoded.ok) throw new Error('Invalid consumer tenant')
    const scopeRef = encoded.value
    const target = await openPreparedServiceWorld(undefined, {
      scopeRef,
      principalRef: standingPrincipalRef(principal),
    })
    target.updateCurrent(current => ({
      ...current,
      sources: { ...current.sources, sources: [{ domain: w.domain, target: w.target }] },
    }))
    const { standing: _, ...base } = target.options
    const backend = createIdentityQualifiedSettingsPreparation({
      required: [],
      identity: {
        verifier: w.identity.authority.verifier,
        standing: w.identity.identity.standing,
        reservations: w.identity.identity.reservations,
      },
      backend: {
        ...base,
        access: {
          authorize: (actor, request) =>
            base.access.authorize(
              { allowed: true, principalRef: standingPrincipalRef(actor) },
              request,
            ),
        },
        plan: (_actor, input) => base.plan(target.context, input),
        currentCommands: (_actor, input) => base.currentCommands(target.context, input),
        sources: {
          reserve: (actor: ActingForTenantPrincipal, request) =>
            sources.service.reserve(actor, request),
          settle: sources.service.settle,
        },
      },
    })
    routes.push({ domain: base.domain, destination: backend.control.sourceDestination })
    consumers.push({ target, backend, principal, scopeRef })
  }
  w.identity.setResolver({
    seal: reservation =>
      reservation.binding.destination === 'settings.organization'
        ? w.backend.control.destination.seal(reservation)
        : (consumers
            .find(c => c.scopeRef === reservation.binding.scopeRef)
            ?.backend.control.destination.seal(reservation) ??
          Promise.resolve({ kind: 'unavailable', diagnostic: 'consumer-not-mounted' })),
  })
  return {
    consumers,
    sources,
    async close() {
      for (const c of consumers) {
        await c.backend.control.close()
        await c.target.close()
      }
      await sources.control.close()
    },
  }
}
