import type { SqlStorage } from '@omne-harness/sql-contract'
import type { GovernanceDefinitionSource } from '@omne-harness/governance-contract'
import { access } from '@omne-harness/legal-identity'
import { GovernanceAdmission } from '../src/admission.ts'
import { GovernanceRegistrar } from '../src/registrar.ts'
import { SqlOperationCoordinator } from '../src/sql-coordinator.ts'
import {
  GovernanceStandingCoordinator,
  GovernanceStandingDestination,
} from '../src/standing-coordinator.ts'
import { controlRequestSchema } from '../src/activation-schema.ts'
import { requestRef } from '../src/operation-schema.ts'
import { digest } from '../src/encoding.ts'
import type { MutationCombination } from '../src/registrar-execution.ts'
import { openActivation } from './activation-world.ts'
import { openStandingWorld } from './standing-world.ts'
import { declaration } from './definition-fixture.ts'

function sqlFor(world: Awaited<ReturnType<typeof openActivation>>, storage = world.storage) {
  const { combinationVersion, manifestDigest } = world.combination('metadata')
  return new SqlOperationCoordinator({
    storage,
    domain: world.domain,
    metadata: { combinationVersion, manifestDigest },
  })
}
export async function openRegistrarWorld() {
  let activation: Awaited<ReturnType<typeof openActivation>> | undefined
  let reopenOptions: Parameters<typeof openActivation>[1]
  const base = await openStandingWorld({
    async openWorld(options) {
      reopenOptions = options
      const opened = await openActivation(undefined, options)
      activation = opened
      return { ...opened, call: raw => opened.control(controlRequestSchema.parse(raw)) }
    },
    resolver(world) {
      if (activation === undefined) throw new Error('fixture activation')
      return new GovernanceStandingDestination(sqlFor(activation), {
        destination: 'governance-contributions',
        transactionDomain: world.domain.transactionDomain,
      })
    },
  })
  if (activation === undefined) throw new Error('fixture activation')
  let current = activation
  let identity = base.identity
  const published = declaration()
  let available = true
  let reads = 0
  const source: GovernanceDefinitionSource = {
    async resolve() {
      reads++
      return available
        ? { kind: 'definition', declaration: structuredClone(published) }
        : { kind: 'unavailable' }
    },
  }
  const context = access(base.principal, base.principal.tenant)
  function command(operationId: string) {
    return {
      scope: base.scope,
      contributorId: 'feature',
      generation: 'generation-1',
      operationId,
      declaration: structuredClone(published),
    }
  }
  function binding(operationId: string) {
    const request = { owner: 'contribute' as const, command: command(operationId) }
    return { ref: requestRef(base.principalRef, request), requestDigest: digest(request) }
  }
  function services(
    options: {
      storage?: SqlStorage
      source?: GovernanceDefinitionSource
      mutation?: MutationCombination
      epoch?: string
    } = {},
  ) {
    const sql = sqlFor(current, options.storage)
    const admission = new GovernanceAdmission({
      tenantRef: base.scope.tenantRef,
      verifier: base.verifier,
      standing: identity.standing,
      grants: [
        {
          principalRef: base.principalRef,
          scope: base.scope,
          action: 'contribute',
          required: [],
          owners: [
            {
              ownerId: published.reference.ownerId,
              enforcementBindings: published.enforcementBindings,
            },
          ],
        },
        { principalRef: base.principalRef, scope: base.scope, action: 'withdraw', required: [] },
      ],
    })
    const standing = new GovernanceStandingCoordinator(sql, identity.reservations)
    const { combinationVersion, manifestDigest } = current.combination('mutation')
    const registrar = new GovernanceRegistrar({
      scope: base.scope,
      epoch: options.epoch ?? 'first',
      transactionDomain: current.domain.transactionDomain,
      destination: base.destination,
      mutation: options.mutation ?? { combinationVersion, manifestDigest },
      definitions: options.source ?? source,
      sql,
      admission,
      standing,
    })
    return { registrar, sql, standing }
  }
  return {
    ...base,
    context,
    command,
    binding,
    services,
    get sourceReads() {
      return reads
    },
    get activation() {
      return current
    },
    get identity() {
      return identity
    },
    setSourceAvailable(value: boolean) {
      available = value
    },
    async reopen() {
      identity.stop()
      await current.close(false)
      current = await openActivation(base.root, reopenOptions)
      const sql = sqlFor(current)
      identity = base.reassemble(
        current.storage,
        new GovernanceStandingDestination(sql, {
          destination: base.destination,
          transactionDomain: current.domain.transactionDomain,
        }),
      )
    },
    async close() {
      identity.stop()
      await current.close(false)
      await base.close()
    },
  }
}
