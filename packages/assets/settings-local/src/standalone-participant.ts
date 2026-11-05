import { z } from 'zod'
import { defineSettings } from '@omne-harness/settings'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  canonical,
  digest,
  json,
  stateKey,
  settingsSqlOperationBinding,
  withinBudget,
} from './encoding.ts'
import { domainSchema, bindingSchema, GUARD_FACT } from './schema.ts'
import { SettingsProjectionBindingSchema, settingsStandaloneProjectionFact } from './projection.ts'
import {
  StandaloneMutationSchema,
  StandaloneRecordSchema,
  STANDALONE_PARTICIPANT,
  STANDALONE_PROTOCOL,
} from './standalone-schema.ts'
const fail = (reason: string) => ({
  kind: 'conflict' as const,
  basis: { kind: 'rejected', reason },
})
function row(port: ParticipantPort, key: string) {
  const raw = port.execute('SELECT record FROM st_targets WHERE target_key = ? LIMIT 1', [key])
    .rows[0]?.[0]
  return raw === undefined ? null : StandaloneRecordSchema.parse(JSON.parse(z.string().parse(raw)))
}
function adoptDefinition(
  port: ParticipantPort,
  record: Extract<
    ReturnType<typeof StandaloneMutationSchema.parse>,
    { kind: 'provision' }
  >['record'],
) {
  const defined = defineSettings(record.definition)
  if (defined.kind !== 'defined') return fail('invalid_input')
  if (record.grants.some(g => !record.sourceIds.includes(g.sourceId))) return fail('invalid_input')
  const definition = defined.definition
  const definitionRef = {
    providerId: definition.providerId,
    definitionId: definition.definitionId,
    version: definition.version,
    digest: digest(definition),
  }
  const definitionKey = canonical([
    definition.providerId,
    definition.definitionId,
    definition.version,
  ])
  const existing = port.execute(
    'SELECT digest FROM st_definitions WHERE definition_key = ? LIMIT 1',
    [definitionKey],
  ).rows[0]?.[0]
  if (existing !== undefined && existing !== definitionRef.digest) return fail('definition_changed')
  port.execute(
    'INSERT INTO st_definitions (definition_key, digest) VALUES (?, ?) ON CONFLICT(definition_key) DO NOTHING',
    [definitionKey, definitionRef.digest],
  )
  return { definition, definitionRef }
}
function mutate(facts: Readonly<Record<string, unknown>>, port: ParticipantPort) {
  const domain = domainSchema.parse(facts['domain'])
  const command = StandaloneMutationSchema.parse(facts['command'])
  const target = command.kind === 'provision' ? command.record.target : command.target
  if (
    domain.scope.kind !== 'tenant' ||
    target.scopeRef !== domain.scope.tenant ||
    target.policyId !== 'independent'
  )
    return fail('forbidden')
  const key = stateKey(domain.scope, target)
  const previous = row(port, key)
  if (previous?.projection.ownerRevision !== (command.expectedRevision ?? undefined))
    return fail('revision_conflict')
  if (previous?.retired) return fail('forbidden')
  if ((previous?.projection.ownerRevision ?? 0) >= Number.MAX_SAFE_INTEGER - 1)
    return fail('limit_exceeded')
  const revision = (previous?.projection.ownerRevision ?? 0) + 1
  let next
  if (command.kind === 'retire') {
    if (!previous) return fail('forbidden')
    next = {
      ...previous,
      retired: true,
      projection: { ...previous.projection, ownerRevision: revision },
    }
  } else {
    const record = command.record
    const adopted = adoptDefinition(port, record)
    if ('kind' in adopted) return adopted
    const { definition, definitionRef } = adopted
    next = {
      retired: false,
      projection: {
        target,
        definition,
        definitionRef,
        sourceIds: record.sourceIds,
        grants: record.grants,
        ownerRevision: revision,
      },
    }
  }
  port.execute(
    'INSERT INTO st_targets (target_key, scope_ref, retired, record) VALUES (?, ?, ?, ?) ON CONFLICT(target_key) DO UPDATE SET retired=excluded.retired, record=excluded.record',
    [key, target.scopeRef, next.retired ? 1 : 0, canonical(next)],
  )
  return { kind: 'participated' as const, response: { kind: 'changed', revision } }
}
function capture(facts: Readonly<Record<string, unknown>>, port: ParticipantPort) {
  const binding = SettingsProjectionBindingSchema.parse(facts['binding'])
  if (binding.domain.scope.kind !== 'tenant') return fail('forbidden')
  const scopeRef = binding.domain.scope.tenant
  if (binding.request.targets.some(t => t.scopeRef !== scopeRef)) return fail('forbidden')
  const enumerate = binding.request.targets.length === 0 && binding.request.mode === 'management'
  const records = enumerate
    ? port
        .execute(
          'SELECT record FROM st_targets WHERE scope_ref = ? AND retired = 0 ORDER BY target_key LIMIT 129',
          [scopeRef],
        )
        .rows.map(r => StandaloneRecordSchema.parse(JSON.parse(z.string().parse(r[0]))))
    : binding.request.targets
        .filter(t => t.policyId === 'independent')
        .map(t => row(port, stateKey(binding.domain.scope, t)))
  const views = records.flatMap(r => (r !== null && !r.retired ? [r.projection] : []))
  if (views.length > 128) return fail('limit_exceeded')
  port.provideFact(settingsStandaloneProjectionFact, json({ binding, views }))
  return { kind: 'participated' as const, response: null }
}
function guard(facts: Readonly<Record<string, unknown>>, port: ParticipantPort) {
  const binding = bindingSchema.parse(facts['binding'])
  const target = binding.command.target
  const reject = (reason: string) => ({
    kind: 'conflict' as const,
    basis: json({
      binding: settingsSqlOperationBinding(binding),
      failure: { kind: 'rejected', reason },
    }),
  })
  if (
    binding.domain.scope.kind !== 'tenant' ||
    target.scopeRef !== binding.domain.scope.tenant ||
    target.policyId !== 'independent'
  )
    return reject('forbidden')
  const current = row(port, stateKey(binding.domain.scope, target))
  if (!current || current.retired) return reject('forbidden')
  const { definition, definitionRef, grants, sourceIds } = current.projection
  port.provideFact(GUARD_FACT, json({ binding, definition, definitionRef, grants, sourceIds }))
  return { kind: 'participated' as const, response: null }
}
export default {
  participant: STANDALONE_PARTICIPANT,
  protocol: STANDALONE_PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts)) return fail('limit_exceeded')
    try {
      if (facts['kind'] === 'mutate') return mutate(facts, port)
      if (facts['kind'] === 'capture') return capture(facts, port)
      if (facts['kind'] === 'guard') return guard(facts, port)
      return fail('invalid_input')
    } catch {
      return { kind: 'failed', diagnostic: 'settings_target_invalid_data' }
    }
  },
} satisfies ParticipantModule
