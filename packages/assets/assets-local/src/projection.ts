import {
  projectSettingsSources,
  SettingsOwnerProjectionSchema,
  SettingsTargetProjectionSchema,
  settingsAssetsProjectionFact,
  settingsSqlGuardFact,
  settingsSqlOperationBinding,
  type SettingsProjectionBinding,
  type SettingsSqlGuardBinding,
  type SettingsTargetProjection,
} from '@omne-harness/settings-local'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonical, equal, json, scopeRef, withinBudget } from './encoding.ts'
import { belongs, readDomain, readHolding, selectedVersion } from './records.ts'

function targetView(
  port: ParticipantPort,
  binding: SettingsProjectionBinding | SettingsSqlGuardBinding,
  target: SettingsTargetProjection['target'],
) {
  if (target.policyId !== 'asset' || target.scopeRef !== scopeRef(binding.domain)) return null
  const holding = readHolding(port, binding.domain, target.targetRef)
  if (!holding || holding.state !== 'held' || holding.sourceLayout.kind !== 'bound') return null
  const selected = selectedVersion(port, holding)
  if (!selected) return null
  if (selected.version.declaration.kind === 'none') return 'undeclared' as const
  const { definition, definitionRef } = selected.version.declaration
  return SettingsTargetProjectionSchema.parse({
    target,
    enabled: holding.enabled,
    definition,
    definitionRef,
    sources: projectSettingsSources(holding.sourceLayout.sources, selected.ownerRevision),
    grants: holding.grants,
    ownerRevision: selected.ownerRevision,
  })
}
export function guard(port: ParticipantPort, binding: SettingsSqlGuardBinding) {
  const fail = (reason: 'forbidden' | 'definition_changed' | 'limit_exceeded') => ({
    kind: 'conflict' as const,
    basis: json({
      binding: settingsSqlOperationBinding(binding),
      failure: { kind: 'rejected', reason },
    }),
  })
  if (!belongs(port, binding.domain)) return fail('forbidden')
  const view = targetView(port, binding, binding.command.target)
  if (!view || view === 'undeclared') return fail('forbidden')
  if (!equal(view.definitionRef, binding.command.definitionRef)) return fail('definition_changed')
  if (!withinBudget(view)) return fail('limit_exceeded')
  port.provideFact(
    settingsSqlGuardFact,
    json({
      binding,
      definition: view.definition,
      definitionRef: view.definitionRef,
      sources: view.sources,
      grants: view.grants,
    }),
  )
  return { kind: 'participated' as const, response: null }
}
function captureTargets(port: ParticipantPort, binding: SettingsProjectionBinding, scope: string) {
  const targets = binding.request.targets
  const selected =
    targets.length === 0 && binding.request.mode === 'management'
      ? port
          .execute(
            "SELECT holding_ref FROM al_holdings WHERE scope_key = ? AND state = 'held' ORDER BY holding_ref LIMIT 129",
            [canonical(binding.domain)],
          )
          .rows.map(row => ({ policyId: 'asset', targetRef: String(row[0]), scopeRef: scope }))
      : targets.filter(target => target.policyId === 'asset')
  return selected
}
function currentViews(
  port: ParticipantPort,
  binding: SettingsProjectionBinding,
  selected: readonly SettingsTargetProjection['target'][],
): SettingsTargetProjection[] | undefined {
  const views: SettingsTargetProjection[] = []
  const seen = new Set<string>()
  for (const target of selected) {
    const key = canonical(target)
    if (seen.has(key)) continue
    seen.add(key)
    const view = targetView(port, binding, target)
    if (
      view === 'undeclared' &&
      binding.request.targets.length === 0 &&
      binding.request.mode === 'management'
    )
      continue
    if (!view || view === 'undeclared') return undefined
    if (binding.request.mode === 'runtime' && !view.enabled) return undefined
    views.push(view)
  }
  return views
}
export function capture(port: ParticipantPort, binding: SettingsProjectionBinding) {
  const fail = (reason: 'forbidden' | 'limit_exceeded') => ({
    kind: 'conflict' as const,
    basis: json({ binding, failure: { kind: 'rejected', reason } }),
  })
  const current = readDomain(port)
  const scope = scopeRef(binding.domain)
  if (scope === null || (current && !equal(current.domain, binding.domain)))
    return fail('forbidden')
  const selected = captureTargets(port, binding, scope)
  if (selected.length > 128) return fail('limit_exceeded')
  const views = currentViews(port, binding, selected)
  if (!views) return fail('forbidden')
  const projection = { binding, views }
  if (!withinBudget(projection)) return fail('limit_exceeded')
  const fact = json(SettingsOwnerProjectionSchema.parse(projection))
  port.provideFact(settingsAssetsProjectionFact, fact)
  return { kind: 'participated' as const, response: fact }
}
