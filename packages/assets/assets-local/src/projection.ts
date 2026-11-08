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
import { canonical, digest, equal, json, scopeRef, withinBudget } from './encoding.ts'
import {
  assetsPublicationFact,
  AssetsPublicationProjectionSchema,
  type AssetsPublicationProjection,
} from './publication.ts'
import { belongs, readDomain, readHolding, selectedVersion } from './records.ts'

function selectedTarget(
  port: ParticipantPort,
  binding: SettingsProjectionBinding | SettingsSqlGuardBinding,
  target: SettingsTargetProjection['target'],
) {
  if (target.policyId !== 'asset' || target.scopeRef !== scopeRef(binding.domain)) return null
  const holding = readHolding(port, binding.domain, target.targetRef)
  if (!holding || holding.state !== 'held') return null
  const selected = selectedVersion(port, holding)
  return selected === null ? null : { holding, ...selected }
}
function settingsView(
  current: NonNullable<ReturnType<typeof selectedTarget>>,
  target: SettingsTargetProjection['target'],
) {
  const { holding, version, ownerRevision } = current
  if (version.declaration.kind === 'none') return 'undeclared' as const
  if (holding.sourceLayout.kind !== 'bound') return null
  const { definition, definitionRef } = version.declaration
  const view = SettingsTargetProjectionSchema.parse({
    target,
    enabled: holding.enabled,
    definition,
    definitionRef,
    sources: projectSettingsSources(holding.sourceLayout.sources, ownerRevision),
    grants: holding.grants,
    ownerRevision,
  })
  return { view, version }
}
function targetView(
  port: ParticipantPort,
  binding: SettingsProjectionBinding | SettingsSqlGuardBinding,
  target: SettingsTargetProjection['target'],
) {
  const current = selectedTarget(port, binding, target)
  return current === null ? null : settingsView(current, target)
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
  const current = targetView(port, binding, binding.command.target)
  if (!current || current === 'undeclared') return fail('forbidden')
  const { view } = current
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
) {
  const views: {
    view: SettingsTargetProjection
    version: NonNullable<ReturnType<typeof selectedVersion>>['version']
  }[] = []
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
    if (binding.request.mode === 'runtime' && !view.view.enabled) return undefined
    views.push(view)
  }
  return views
}
export function capture(
  port: ParticipantPort,
  binding: SettingsProjectionBinding,
  publication = false,
) {
  const fail = (reason: 'forbidden' | 'limit_exceeded' | 'invalid_input') => ({
    kind: 'conflict' as const,
    basis: json({ binding, failure: { kind: 'rejected', reason } }),
  })
  if (
    publication &&
    new Set(binding.request.targets.map(canonical)).size !== binding.request.targets.length
  )
    return fail('invalid_input')
  const current = readDomain(port)
  const scope = scopeRef(binding.domain)
  if (scope === null || (current && !equal(current.domain, binding.domain)))
    return fail('forbidden')
  const selected = captureTargets(port, binding, scope)
  if (selected.length > 128) return fail('limit_exceeded')
  if (publication) return capturePublications(port, binding, selected)
  const currentTargets = currentViews(port, binding, selected)
  if (!currentTargets) return fail('forbidden')
  const projection = { binding, views: currentTargets.map(current => current.view) }
  if (!withinBudget(projection)) return fail('limit_exceeded')
  const fact = json(SettingsOwnerProjectionSchema.parse(projection))
  port.provideFact(settingsAssetsProjectionFact, fact)
  return { kind: 'participated' as const, response: fact }
}

function capturePublications(
  port: ParticipantPort,
  binding: SettingsProjectionBinding,
  targets: readonly SettingsTargetProjection['target'][],
) {
  const fail = (reason: 'forbidden' | 'limit_exceeded') => ({
    kind: 'conflict' as const,
    basis: json({ binding, failure: { kind: 'rejected', reason } }),
  })
  const views: Array<AssetsPublicationProjection['views'][number]> = []
  const settings: SettingsTargetProjection[] = []
  for (const target of targets) {
    const current = selectedTarget(port, binding, target)
    if (current === null || (binding.request.mode === 'runtime' && !current.holding.enabled))
      return fail('forbidden')
    const view = settingsView(current, target)
    if (view === null) return fail('forbidden')
    if (view !== 'undeclared') settings.push(view.view)
    const { version, ownerRevision } = current
    views.push({
      target,
      definitionRef: version.declaration.kind === 'none' ? null : version.declaration.definitionRef,
      ownerRevision,
      publicationRef: {
        assetRef: version.assetRef,
        category: version.category,
        name: version.name,
        version: version.version,
        source: version.source,
        bodyDigest: digest(version.body),
      },
    })
  }
  const publications = AssetsPublicationProjectionSchema.parse({ binding, views })
  const projection = SettingsOwnerProjectionSchema.parse({ binding, views: settings })
  if (!withinBudget(publications) || !withinBudget(projection)) return fail('limit_exceeded')
  const publicationFact = json(publications)
  port.provideFact(settingsAssetsProjectionFact, json(projection))
  port.provideFact(assetsPublicationFact, publicationFact)
  return { kind: 'participated' as const, response: publicationFact }
}
