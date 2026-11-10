import { rmSync } from 'node:fs'
import { organizationCodec } from '@omne-harness/legal-identity'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { createIdentityQualifiedSettingsSources } from '@omne-harness/settings-local/preparation'
import { openSourceServiceWorld } from '../../../assets/settings-local/tests/source-service-world.ts'
import { GovernanceSourceDestination } from '../src/source-destination.ts'
import {
  GovernanceSourceCoordinator,
  type GovernanceSourceReservations,
} from '../src/source-coordinator.ts'
import { binding } from './operation-world.ts'
import { capture } from './permission-capture-world.ts'
import { openRegistrarWorld } from './registrar-world.ts'

export async function openSourceCoordinatorWorld() {
  const governance = await openRegistrarWorld()
  const organization = organizationCodec.encode(governance.principal.tenant.organization)
  if (!organization.ok) throw new Error('Organization fixture encoding failed')
  const base = capture(governance.scope)
  const command = base.request.command
  const input = {
    ...base,
    principalRef: governance.principalRef,
    request: {
      ...base.request,
      command: {
        ...command,
        permission: {
          ...command.permission,
          scope: { ...command.permission.scope, organizationId: organization.value },
        },
        source: {
          ...command.source,
          target: { ...command.source.target, scopeRef: organization.value },
        },
      },
    },
  }
  const operation = binding(input)
  let destination = new GovernanceSourceDestination(governance.services().sql, command.sourceRoute)
  const router = {
    recognize: (request: Parameters<GovernanceSourceDestination['recognize']>[0]) =>
      destination.recognize(request),
    seal: (request: Parameters<GovernanceSourceDestination['seal']>[0]) =>
      destination.seal(request),
  }
  let source = await openSourceServiceWorld(router, undefined, input.request.command.source)
  function qualify() {
    return createIdentityQualifiedSettingsSources({
      backend: {
        ...source.options,
        access: {
          async authorize(principal: ActingForTenantPrincipal, request) {
            return {
              kind: 'authorized',
              scope: request.source.domain.scope,
              target: request.source.target,
              principalRef: standingPrincipalRef(principal),
            }
          },
        },
      },
      identity: { verifier: governance.verifier, standing: governance.identity.standing },
    })
  }
  let qualified = qualify()
  return {
    governance,
    input,
    operation,
    get source() {
      return source
    },
    get service() {
      return qualified.service
    },
    coordinator(
      service: GovernanceSourceReservations<ActingForTenantPrincipal> = qualified.service,
    ) {
      return new GovernanceSourceCoordinator(governance.services().sql, service)
    },
    async accept(epoch = input.epoch) {
      const { sql, standing } = governance.services()
      const accepted = await sql.accept({ ...input, epoch })
      if (accepted.kind !== 'found') throw new Error(JSON.stringify(accepted))
      const held = await standing.reserve(
        { operation, destination: governance.destination, required: [] },
        governance.principal,
      )
      if (held.kind !== 'held') throw new Error(JSON.stringify(held))
    },
    async reopen() {
      await qualified.control.close()
      await source.close()
      await governance.reopen()
      destination = new GovernanceSourceDestination(governance.services().sql, command.sourceRoute)
      source = await openSourceServiceWorld(router, source.root, input.request.command.source)
      qualified = qualify()
    },
    async close() {
      await qualified.control.close()
      await source.close()
      await governance.close()
      rmSync(source.root, { recursive: true, force: true })
    },
  }
}
