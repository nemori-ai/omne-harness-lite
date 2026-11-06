import { isIndependentTargetInDomain } from './standalone-records.ts'
import { z } from 'zod'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  readStandaloneSettingsRecord as row,
  projectStandaloneSettingsRecord as projection,
} from './standalone-records.ts'
import { json, stateKey, settingsSqlOperationBinding, withinBudget } from './encoding.ts'
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
  const active = records.filter(r => r !== null).filter(r => !r.retired)
  const views = []
  for (const record of active) {
    const view = projection(record)
    if (!view) return fail('unavailable')
    views.push(view)
  }
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
      if (facts['kind'] === 'capture') return capture(facts, port)
      if (facts['kind'] === 'guard') return guard(facts, port)
      return fail('invalid_input')
    } catch {
      return { kind: 'failed', diagnostic: 'settings_target_projection_invalid_data' }
    }
  },
} satisfies ParticipantModule
