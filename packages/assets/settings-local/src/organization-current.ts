import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SqlMaterialCatalog, DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type { SettingsPreparationOptions, PreparationRegistration } from './preparation-types.ts'
import { COMMIT_CURRENT } from './commit-current.ts'
import { PREPARATION_CURRENT } from './finalization-schema.ts'
import { preparationPlanSchema } from './preparation-observation.ts'
import { domainSchema, failureSchema } from './schema.ts'
import {
  organizationCurrentConfigurationSchema,
  organizationCurrentParticipant,
  organizationCurrentPhaseSchema,
  type OrganizationCurrentPhase,
  organizationCurrentRequestSchema,
  type OrganizationCurrentConfiguration,
} from './organization-current-schema.ts'
import { matchesOrganizationCurrentSource } from './organization-current-material.ts'
import { digest, equal, json } from './encoding.ts'
export function settingsOrganizationCurrentMaterials(
  configuration: OrganizationCurrentConfiguration,
): SqlMaterialCatalog['participants'] {
  const parsed = organizationCurrentConfigurationSchema.parse(configuration)
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./organization-current-participant.${extension}`, import.meta.url)
  return organizationCurrentPhaseSchema.options.map(phase => {
    const url = new URL(file)
    url.searchParams.set('phase', phase)
    url.searchParams.set('configuration', JSON.stringify(parsed))
    return {
      participant: organizationCurrentParticipant(phase),
      protocol: `settings-organization-current/1/${phase}/${digest(parsed)}`,
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
      ownedTables: [],
      readTables: ['st_targets', 'st_states'],
      allowedFunctions: [],
      grouping: 'groupable',
      requiresFacts: [],
      providesFacts:
        phase === 'capture' ? [] : [phase === 'ready' ? PREPARATION_CURRENT : COMMIT_CURRENT],
    }
  })
}
type NativeAdapter = Pick<
  SettingsPreparationOptions<ActingForTenantPrincipal>,
  'access' | 'plan' | 'currentCommands'
>
export function createOrganizationSettingsCurrent(options: {
  storage: SqlStorage
  domain: DomainRef
  capture: PreparationRegistration
  configuration: OrganizationCurrentConfiguration
}): NativeAdapter {
  const domain = domainSchema.parse(options.domain)
  if (domain.scope.kind !== 'system' || domain.transactionDomain !== 'system.settings')
    throw new TypeError('Organization settings require system.settings')
  const configuration = organizationCurrentConfigurationSchema.parse(options.configuration)
  const capture = { ...options.capture }
  function actor(
    principal: ActingForTenantPrincipal,
    identity: Parameters<NativeAdapter['plan']>[1]['identity'],
  ) {
    const tenant = tenantCodec.encode(principal.tenant)
    if (
      !tenant.ok ||
      !equal(identity.domain, domain) ||
      identity.principalRef !== standingPrincipalRef(principal) ||
      !matchesOrganizationCurrentSource({ domain, target: identity.operation.target }, tenant.value)
    )
      throw new Error('Organization settings principal and target mismatch')
    return tenant.value
  }
  function command(
    phase: OrganizationCurrentPhase,
    request: ReturnType<typeof organizationCurrentRequestSchema.parse>,
  ) {
    return {
      participant: organizationCurrentParticipant(phase),
      facts: { request: json(organizationCurrentRequestSchema.parse(request)) },
    }
  }
  return {
    access: {
      async authorize(principal, request) {
        const tenant = tenantCodec.encode(principal.tenant)
        if (
          !tenant.ok ||
          !equal(request.scope, domain.scope) ||
          !matchesOrganizationCurrentSource({ domain, target: request.target }, tenant.value)
        )
          return { kind: 'rejected', reason: 'forbidden' }
        return {
          kind: 'authorized',
          scope: domain.scope,
          target: request.target,
          principalRef: standingPrincipalRef(principal),
        }
      },
    },
    async plan(principal, { identity, intent }) {
      const actorTenantRef = actor(principal, identity)
      const result = await options.storage.commit({
        identity: {
          ...domain,
          operation: 'settings.organization-current',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        ...capture,
        commands: [
          command('capture', { identity, commandKind: intent.kind, actorTenantRef, attempt: null }),
        ],
      })
      if (result.kind !== 'committed') return { kind: 'rejected', reason: 'unavailable' }
      const response = result.responses.find(
        r => r.participant === organizationCurrentParticipant('capture'),
      )?.reply.response
      const failure = failureSchema.safeParse(response)
      if (failure.success) return failure.data
      const plan = preparationPlanSchema.parse(response)
      if (
        plan.standing.kind !== 'identity' ||
        plan.standing.destination !== configuration.destination ||
        plan.sources.route !== configuration.sourceRoute
      )
        throw new Error('Organization current configuration mismatch')
      return plan
    },
    currentCommands(principal, { phase, binding }) {
      return [
        command(phase, {
          identity: binding.identity,
          commandKind: binding.commandKind,
          actorTenantRef: actor(principal, binding.identity),
          attempt: binding,
        }),
      ]
    },
  }
}
