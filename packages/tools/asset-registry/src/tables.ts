import type { AssetDefinition, CapabilityId } from '@omne-harness-lite/asset-model'
import type { EffectiveAssembly, EffectiveAsset } from '@omne-harness-lite/asset-evaluation'
import type { EvaluationRef, ManifestRecord } from '@omne-harness-lite/assembly-manifest-store'
import {
  toolDependencies,
  type ToolDefinition,
  type TargetEnvironment,
} from '@omne-harness-lite/tool-definition'
import { skillDependencies, type SkillPackage } from '@omne-harness-lite/skill-package/v2'
import type { LoopExtensionDefinition } from '@omne-harness-lite/loop-extension/v3'
import { equal, own, requiredOwn } from './json.ts'
import {
  assetJudge,
  capability,
  compositionFor,
  effective,
  entryName,
  filledBy,
  permutation,
  readRegistryRecord,
  registered,
} from './records.ts'
import {
  REGISTERED_CATEGORIES,
  type RegisteredCategory,
  type RegistryEntry,
  type RegistrySnapshot,
  type TablePlan,
  type TableBuildResult,
  type BodySelection,
  type AvailabilityFacts,
  type Availability,
  type RegistryFailure,
} from './types.ts'
/** Values only. Source authorization and input production remain the caller's obligations. */
export function selectBody(
  definitions: readonly AssetDefinition[],
  asset: EffectiveAsset,
): BodySelection | undefined {
  const matches = definitions.filter(
    definition => definition.id === asset.asset && equal(definition.capability, asset.capability),
  )
  const definition = matches[0]
  if (
    matches.length !== 1 ||
    definition === undefined ||
    !('ok' in assetJudge.judgeAssetValue('AssetDefinition', definition))
  )
    return undefined
  const versions = definition.versions.filter(version => equal(version.number, asset.version))
  const version = versions[0]
  return versions.length === 1 &&
    version !== undefined &&
    version.content.category === asset.capability.category
    ? requiredOwn({ capability: asset.capability, asset: asset.asset, version })
    : undefined
}
export function dependenciesOf(
  entry: RegistryEntry,
  evaluation: EffectiveAssembly,
): readonly AvailabilityFacts['dependencies'][number]['dependency'][] {
  if (entry.content.category === 'tool') {
    const definition = entry.content.definition as unknown as ToolDefinition
    const value = evaluation.values.find(
      value => equal(value.capability, entry.capability) && value.item === 'targetEnvironment',
    )
    if (definition.settings?.targetEnvironment !== undefined && value === undefined)
      return [{ kind: 'target_environment', state: 'unreadable' }]
    return requiredOwn(
      toolDependencies(definition, value?.value as unknown as TargetEnvironment | undefined),
    ) as unknown as readonly AvailabilityFacts['dependencies'][number]['dependency'][]
  }
  if (entry.content.category === 'skill')
    return requiredOwn(
      skillDependencies(entry.content.body as unknown as SkillPackage),
    ) as unknown as readonly AvailabilityFacts['dependencies'][number]['dependency'][]
  if (entry.content.category === 'loop_extension')
    return (
      (entry.content.extension as unknown as LoopExtensionDefinition).needs?.map(name => ({
        kind: 'external_service',
        name,
      })) ?? []
    )
  if (entry.content.category === 'mcp') return [{ kind: 'mcp_bridge' }]
  return []
}
/** Pure public dependency resolution; all declared items require their own explicit observation. */
export function computeAvailability(
  entry: RegistryEntry,
  declarations: readonly AvailabilityFacts['dependencies'][number]['dependency'][],
  facts: AvailabilityFacts,
): RegistryEntry {
  const issues = declarations.flatMap(dependency => {
    const matching = facts.dependencies.filter(item => equal(item.dependency, dependency))
    const observation = matching.length === 1 ? matching[0] : undefined
    return observation?.state === 'satisfied'
      ? []
      : [
          {
            dependency,
            state:
              observation?.state === 'missing' ? ('missing' as const) : ('unreadable' as const),
          },
        ]
  })
  const availability: Availability =
    issues.length === 0
      ? { kind: 'available' }
      : entry.capability.category === 'tool' || entry.capability.category === 'skill'
        ? { kind: 'stand_in', for: issues }
        : { kind: 'unavailable', reason: issues }
  const { commandAvailability: _previous, ...base } = entry
  if (entry.content.category !== 'tool' || availability.kind !== 'available')
    return requiredOwn({ ...base, availability })
  const definition = entry.content.definition as unknown as ToolDefinition
  if (definition.paradigm !== 'multi') return requiredOwn({ ...base, availability })
  const commandAvailability = Object.fromEntries(
    Object.keys(definition.commands).map(name => [
      name,
      name === 'request_approval' && entry.capability.name === 'omne-official:Ask'
        ? facts.runMode === undefined
          ? { kind: 'unavailable', reason: 'run_mode_unreadable' }
          : facts.runMode === 'never'
            ? { kind: 'unavailable', reason: 'run_mode_never' }
            : { kind: 'available' }
        : { kind: 'available' },
    ]),
  )
  return requiredOwn({ ...base, availability, commandAvailability }) as RegistryEntry
}
/** Unsupported live providers remain unreadable. Tool capabilities use actual preceding tool readings. */
export function computeTableAvailability(
  plans: readonly TablePlan[],
  evaluation: EffectiveAssembly,
): readonly TablePlan[] {
  const resolved = new Map<string, RegistryEntry>()
  const process = (plan: TablePlan): TablePlan => ({
    ...plan,
    entries: plan.entries.map(entry => {
      const declarations = dependenciesOf(entry, evaluation)
      const dependencies = declarations.map(dependency => {
        if (
          dependency !== null &&
          typeof dependency === 'object' &&
          'kind' in dependency &&
          dependency.kind === 'tool' &&
          'capability' in dependency &&
          capability(dependency.capability)
        ) {
          const tool = resolved.get(entryName(dependency.capability))
          return {
            dependency,
            state:
              tool === undefined || tool.availability.kind !== 'available'
                ? ('missing' as const)
                : ('satisfied' as const),
          }
        }
        return { dependency, state: 'unreadable' as const }
      })
      const result = computeAvailability(entry, declarations, { dependencies })
      if (entry.capability.category === 'tool') resolved.set(entryName(entry.capability), result)
      return result
    }),
  })
  const tool = plans.find(plan => plan.category === 'tool')
  const computed = tool === undefined ? [] : [process(tool)]
  for (const plan of plans) if (plan !== tool) computed.push(process(plan))
  return requiredOwn(
    plans.map(plan => computed.find(item => item.category === plan.category) as TablePlan),
  )
}
export function buildTableContents(
  value: unknown,
  sequence: unknown,
  definitionsValue: unknown,
  categories: readonly RegisteredCategory[] = REGISTERED_CATEGORIES,
): TableBuildResult {
  const evaluation = effective(value)
  const copiedOrder = own(sequence),
    copiedDefinitions = own(definitionsValue)
  if (
    evaluation === undefined ||
    !Array.isArray(copiedOrder) ||
    !permutation(evaluation, copiedOrder as unknown as readonly CapabilityId[]) ||
    !Array.isArray(copiedDefinitions) ||
    categories.length === 0 ||
    !categories.every(registered) ||
    new Set(categories).size !== categories.length
  )
    return { failure: 'invalidInput' }
  if (evaluation.unresolved.length !== 0)
    return requiredOwn({ failure: 'dependencyUnresolved', missing: evaluation.unresolved })
  const definitions = copiedDefinitions as unknown as readonly AssetDefinition[]
  const plans: TablePlan[] = []
  for (const category of categories) {
    const composition = compositionFor(
      evaluation,
      copiedOrder as unknown as readonly CapabilityId[],
      category,
    )
    if (composition === undefined) return { failure: 'unavailable' }
    const entries: RegistryEntry[] = []
    for (const tuple of composition) {
      const source = selectBody(definitions, { ...tuple, replaced: [] })
      if (source === undefined) return { failure: 'unavailable' }
      entries.push({
        capability: tuple.capability,
        asset: tuple.asset,
        from: tuple.from,
        content: source.version.content,
        availability: { kind: 'available' },
        ...(tuple.resident === undefined ? {} : { resident: tuple.resident }),
      })
    }
    plans.push({ category, composition, entries })
  }
  const tools = plans.find(plan => plan.category === 'tool')?.entries ?? []
  if (new Set(tools.map(entry => entryName(entry.capability))).size !== tools.length)
    return { failure: 'toolNameConflict' }
  return { plans: computeTableAvailability(plans, evaluation) }
}
/** Projection only: performs no IO and can be prepared before committed publication. */
export function buildSnapshots(
  record: ManifestRecord,
  plans: readonly TablePlan[],
): readonly RegistrySnapshot[] {
  const checked = readRegistryRecord(record, record.session, record.seq)
  if (checked === undefined) throw new TypeError('registry committed record cannot be projected')
  return requiredOwn(
    plans.map(plan => {
      const table = record.tables[plan.category]
      if (table === undefined || !equal(table.composition, plan.composition))
        throw new TypeError('committed registry table differs from its prepared plan')
      return {
        category: plan.category,
        entries: plan.entries,
        filledAt: table.filledAt,
        filledBy: checked.content.filledBy,
        basedOn: record.evaluationRef,
      }
    }),
  )
}
export function findInSnapshot(
  snapshot: RegistrySnapshot,
  name: string,
): { readonly entry: RegistryEntry } | { readonly none: true } {
  const entry = snapshot.entries.find(entry => entryName(entry.capability) === name)
  return entry === undefined ? { none: true } : requiredOwn({ entry })
}
