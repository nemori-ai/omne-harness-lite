import { readPublication } from './standalone-publication-record.ts'
import {
  settingsStandalonePublicationFact,
  StandalonePublicationProjectionSchema,
} from './standalone-publication.ts'
import { isIndependentTargetInDomain } from './standalone-records.ts'
import { z } from 'zod'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  readStandaloneSettingsRecord as row,
  projectStandaloneSettingsRecord as projection,
} from './standalone-records.ts'
import { canonical, json, stateKey, settingsSqlOperationBinding, withinBudget } from './encoding.ts'
import { bindingSchema, GUARD_FACT } from './schema.ts'
import { SettingsProjectionBindingSchema, settingsStandaloneProjectionFact } from './projection.ts'
import {
  StandaloneRecordSchema,
  STANDALONE_PROJECTION,
  STANDALONE_PROTOCOL,
} from './standalone-schema.ts'
const fail = (reason: string) => ({
  kind: 'conflict' as const,
  basis: { kind: 'rejected', reason },
})
function captureRecords(
  port: ParticipantPort,
  binding: ReturnType<typeof SettingsProjectionBindingSchema.parse>,
) {
  const enumerate = binding.request.targets.length === 0 && binding.request.mode === 'management'
  const records = enumerate
    ? port
        .execute(
          'SELECT record FROM st_targets WHERE scope_ref = ? AND retired = 0 ORDER BY target_key LIMIT 129',
          [binding.domain.scope.kind === 'tenant' ? binding.domain.scope.tenant : ''],
        )
        .rows.map(r => StandaloneRecordSchema.parse(JSON.parse(z.string().parse(r[0]))))
    : binding.request.targets
        .filter(t => t.policyId === 'independent')
        .map(t => row(port, stateKey(binding.domain.scope, t)))
  if (!enumerate && records.some(r => r === null || r.retired)) return undefined
  return records.filter(r => r !== null).filter(r => !r.retired)
}
function captureViews(
  port: ParticipantPort,
  binding: ReturnType<typeof SettingsProjectionBindingSchema.parse>,
) {
  const records = captureRecords(port, binding)
  if (!records) return fail('forbidden')
  if (records.length > 128) return fail('limit_exceeded')
  const views = []
  for (const record of records) {
    const view = projection(record)
    if (!view) return fail('unavailable')
    if (binding.request.mode === 'runtime' && !view.enabled) return fail('forbidden')
    views.push(view)
  }
  return { kind: 'views' as const, views }
}
function capture(facts: Readonly<Record<string, unknown>>, port: ParticipantPort) {
  const binding = SettingsProjectionBindingSchema.parse(facts['binding'])
  if (binding.domain.scope.kind !== 'tenant') return fail('forbidden')
  const scopeRef = binding.domain.scope.tenant
  if (binding.request.targets.some(t => t.scopeRef !== scopeRef)) return fail('forbidden')
  if (
    facts['kind'] === 'capturePublication' &&
    new Set(binding.request.targets.map(canonical)).size !== binding.request.targets.length
  )
    return fail('invalid_input')
  const captured = captureViews(port, binding)
  if (captured.kind !== 'views') return captured
  const { views } = captured
  if (!withinBudget({ binding, views })) return fail('limit_exceeded')
  port.provideFact(settingsStandaloneProjectionFact, json({ binding, views }))
  if (facts['kind'] !== 'capturePublication')
    return { kind: 'participated' as const, response: null }
  const publications = StandalonePublicationProjectionSchema.parse({
    binding,
    views: views.map(view => ({
      target: view.target,
      ownerRevision: view.ownerRevision,
      definitionRef: view.definitionRef,
      publicationRef: readPublication(port, stateKey(binding.domain.scope, view.target)),
    })),
  })
  if (!withinBudget(publications)) return fail('limit_exceeded')
  port.provideFact(settingsStandalonePublicationFact, json(publications))
  return { kind: 'participated' as const, response: json(publications) }
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
  if (!isIndependentTargetInDomain(binding.domain, target)) return reject('forbidden')
  const current = row(port, stateKey(binding.domain.scope, target))
  if (!current || current.retired) return reject('forbidden')
  const view = projection(current)
  if (!view) return reject('unavailable')
  const { definition, definitionRef, grants, sources } = view
  port.provideFact(GUARD_FACT, json({ binding, definition, definitionRef, grants, sources }))
  return { kind: 'participated' as const, response: null }
}
export default {
  participant: STANDALONE_PROJECTION,
  protocol: STANDALONE_PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts)) return fail('limit_exceeded')
    try {
      if (facts['kind'] === 'capture' || facts['kind'] === 'capturePublication')
        return capture(facts, port)
      if (facts['kind'] === 'guard') return guard(facts, port)
      return fail('invalid_input')
    } catch {
      return { kind: 'failed', diagnostic: 'settings_target_projection_invalid_data' }
    }
  },
} satisfies ParticipantModule
