import type {
  ParticipantModule,
  ParticipantPort,
  ReadPort,
} from '@omne-harness/sql-contract/worker'
import { commitCurrentSchema, COMMIT_CURRENT, businessRefusalSchema } from './commit-current.ts'
import { preparationCurrentSchema, PREPARATION_CURRENT } from './finalization-schema.ts'
import {
  organizationCurrentMaterial,
  matchesOrganizationCurrentSource,
} from './organization-current-material.ts'
import {
  organizationCurrentConfigurationSchema,
  organizationCurrentPhaseSchema,
  organizationCurrentRequestSchema,
  organizationCurrentParticipant,
} from './organization-current-schema.ts'
import {
  readStandaloneSettingsRecord,
  projectStandaloneSettingsRecord,
} from './standalone-records.ts'
import { readProjectedSettingsState } from './projected-state.ts'
import { readStateRecord } from './records.ts'
import { secretItemsOf } from './secret-items.ts'
import { sourceKey } from './source-retention-records.ts'
import { digest, equal, json, stateKey, withinBudget } from './encoding.ts'
const parameters = new URL(import.meta.url).searchParams
const phase = organizationCurrentPhaseSchema.parse(parameters.get('phase'))
const configuration = organizationCurrentConfigurationSchema.parse(
  JSON.parse(parameters.get('configuration') ?? 'null'),
)
type Request = ReturnType<typeof organizationCurrentRequestSchema.parse>
function current(port: ReadPort, request: Request) {
  const source = { domain: request.identity.domain, target: request.identity.operation.target }
  if (!matchesOrganizationCurrentSource(source, request.actorTenantRef))
    return { kind: 'rejected' as const, reason: 'forbidden' as const }
  const record = readStandaloneSettingsRecord(port, stateKey(source.domain.scope, source.target))
  if (!record || record.retired) return { kind: 'rejected' as const, reason: 'forbidden' as const }
  const projection = projectStandaloneSettingsRecord(record)
  if (!projection) return { kind: 'rejected' as const, reason: 'basis_changed' as const }
  const value =
    request.commandKind === 'change'
      ? projectedRevision(port, source.domain.scope, projection)
      : historicalRevision(port, request)
  if ('kind' in value) return value
  return organizationCurrentMaterial(
    { source, projection, actorTenantRef: request.actorTenantRef, value },
    configuration,
  )
}
function projectedRevision(
  port: ReadPort,
  scope: Request['identity']['domain']['scope'],
  projection: NonNullable<ReturnType<typeof projectStandaloneSettingsRecord>>,
) {
  const value = readProjectedSettingsState(port, scope, projection)
  return 'kind' in value ? value : { revision: value.view.state.revision, presence: value.presence }
}
function historicalRevision(port: ReadPort, request: Request) {
  const record = readStateRecord(
    port,
    request.identity.domain.scope,
    request.identity.operation.target,
  )
  return {
    revision: record?.state.revision ?? 0,
    presence: record ? ('present' as const) : ('absent' as const),
  }
}
function capture(request: Request, result: ReturnType<typeof current>) {
  if (request.attempt !== null)
    throw new Error('Initial organization capture cannot carry an attempt')
  if ('kind' in result) return { kind: 'participated' as const, response: json(result) }
  const { basis, standing, sources, definition } = result
  return {
    kind: 'participated' as const,
    response: json({
      kind: 'planned',
      basis,
      standing,
      sources,
      secretItems: secretItemsOf(definition),
      purpose: {
        kind: 'source-update',
        sourceKey: sourceKey({
          domain: request.identity.domain,
          target: request.identity.operation.target,
        }),
      },
    }),
  }
}
function observation(result: ReturnType<typeof current>) {
  if (!('kind' in result)) return { kind: 'available' as const, material: result }
  const reason = businessRefusalSchema.safeParse(result.reason)
  return reason.success
    ? { kind: 'refused' as const, reason: reason.data }
    : { kind: 'unavailable' as const }
}
function publish(request: Request, result: ReturnType<typeof current>, port: ParticipantPort) {
  const binding = request.attempt
  if (
    binding === null ||
    !equal(binding.identity, request.identity) ||
    binding.commandKind !== request.commandKind
  )
    throw new Error('Organization current attempt mismatch')
  if (phase === 'ready') {
    if ('kind' in result) return { kind: 'unsupported' as const, basis: json(result) }
    port.provideFact(
      PREPARATION_CURRENT,
      json(
        preparationCurrentSchema.parse({
          binding,
          basis: result.basis,
          standing: result.standing,
          sources: result.sources,
        }),
      ),
    )
  } else {
    port.provideFact(
      COMMIT_CURRENT,
      json(commitCurrentSchema.parse({ binding, observation: observation(result) })),
    )
  }
  return { kind: 'participated' as const, response: null }
}
export default {
  participant: organizationCurrentParticipant(phase),
  protocol: `settings-organization-current/1/${phase}/${digest(configuration)}`,
  execute(facts, port) {
    if (!withinBudget(facts))
      return { kind: 'failed', diagnostic: 'settings_organization_current_limit' }
    const request = organizationCurrentRequestSchema.parse(facts['request'])
    const result = current(port, request)
    return phase === 'capture' ? capture(request, result) : publish(request, result, port)
  },
} satisfies ParticipantModule
