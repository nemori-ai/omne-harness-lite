import {
  type AssetDefinition,
  type AssetHolding,
  type AttributeAssignment,
  type AttributeDeclaration,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeAgentDefinitionBody } from '@omne-harness-lite/agent-definition'
import { getAssetJudge } from './defaults.ts'
import { diagnostic, invalidInput } from './diagnostics.ts'
import {
  assignmentsFor,
  declarationsFor,
  heldDefinition,
  index,
  key,
  permission,
  same,
  targetDeclaration,
  versionOf,
  type EvaluationFacts,
  type Selected,
} from './holdings.ts'
import { canonical, copyJson, immutable, codePointCompare } from './json.ts'
import {
  classifyPermissionAssignment,
  resolvePermission,
  strictPermission,
  tiersOf,
  type LayerPermissionAssignment,
} from './permissions.ts'
import { selectAssets, type Selection } from './selection.ts'
import type {
  AssetReference,
  CompositionRoot,
  EffectiveAsset,
  EffectiveAssembly,
  EffectiveValue,
  EvaluationResult,
  FilteredOut,
  InputDiagnostic,
  Layer,
  NonConnectorEvaluationInput,
  PermissionDeclaration,
  Unresolved,
} from './types.ts'

export type { EvaluationFacts }

/** C13: each MCP action set names a held mcp endpoint at its scope, once, with fetched actions. */
function mcpActionSetsDiagnostic(input: NonConnectorEvaluationInput): InputDiagnostic | undefined {
  const actionKeys = new Set<string>()
  for (const entry of input.mcpActionSets ?? []) {
    const token = `${key(entry.endpoint)}:${entry.scope}`
    if (
      entry.endpoint.category !== 'mcp' ||
      !input.holdings.some(
        holding => same(holding.capability, entry.endpoint) && holding.holder.layer === entry.scope,
      ) ||
      actionKeys.has(token) ||
      entry.actions.kind !== 'fetched'
    )
      return diagnostic('C13', 'invalid MCP action set')
    actionKeys.add(token)
  }
  return undefined
}
/** C14: root references name each capability once; `resident` appears only on tool and skill references. */
function rootReferencesDiagnostic(root: CompositionRoot): InputDiagnostic | undefined {
  const refs = root.references.map(entry => key(entry.capability))
  if (
    new Set(refs).size !== refs.length ||
    root.references.some(
      entry =>
        entry.resident !== undefined &&
        entry.capability.category !== 'tool' &&
        entry.capability.category !== 'skill',
    )
  )
    return diagnostic('C14', 'invalid root references')
  return undefined
}
/** C16: when the root has an effective asset, the declared source is that asset and version. */
function rootSourceDiagnostic(
  root: CompositionRoot,
  selectedRoot: Selected | undefined,
): InputDiagnostic | undefined {
  if (
    selectedRoot !== undefined &&
    (root.source.asset !== selectedRoot.definition.id ||
      ExactDecimal.from(root.source.version).compare(
        ExactDecimal.from(selectedRoot.version.number),
      ) !== 0)
  )
    return diagnostic('C16', 'root source differs from the selected asset version')
  return undefined
}

interface Composition {
  readonly composition: ReadonlyMap<string, CapabilityId>
  readonly unresolved: Unresolved[]
  readonly cycle: readonly CapabilityId[] | undefined
  readonly unsupported: 'plugin' | 'agent_definition' | undefined
}
/** S-20: walk from root.references along each selected asset's declared references. */
function compose(
  input: NonConnectorEvaluationInput,
  selected: ReadonlyMap<string, Selected>,
  facts: EvaluationFacts,
): Composition {
  const composition = new Map<string, CapabilityId>()
  const unresolved: Unresolved[] = []
  let cycle: readonly CapabilityId[] | undefined
  let unsupported: 'plugin' | 'agent_definition' | undefined
  const root = input.root.definition
  const visited = new Set<string>()
  const visit = (
    capability: CapabilityId,
    parent: CapabilityId,
    path: readonly CapabilityId[],
  ): void => {
    const asset = selected.get(key(capability))
    if (asset === undefined) {
      unresolved.push({ capability, referencedBy: parent })
      return
    }
    const repeated = path.findIndex(entry => same(entry, capability))
    if (repeated >= 0) {
      const segment = path.slice(repeated)
      if (segment.every(entry => entry.category === 'skill' || entry.category === 'tool')) return
      cycle ??= segment
      return
    }
    if (capability.category === 'plugin' || capability.category === 'agent_definition') {
      unsupported ??= capability.category
      return
    }
    composition.set(key(capability), capability)
    if (visited.has(key(capability))) return
    visited.add(key(capability))
    const references = facts.references.get(asset.version)
    if (references === undefined) throw new Error('admitted supported body has no reference facts')
    for (const reference of [...references].sort((left, right) =>
      codePointCompare(key(left), key(right)),
    ))
      visit(reference, capability, [...path, capability])
  }
  if (!selected.has(key(root))) unresolved.push({ capability: root })
  else
    for (const reference of [...input.root.references].sort((left, right) =>
      codePointCompare(key(left.capability), key(right.capability)),
    ))
      visit(reference.capability, root, [root])
  return { composition, unresolved, cycle, unsupported }
}

/** C10: one assignment's value lies in its declaration's domain (root settings by AD1, permissions by the enum, settings by the schema). */
function assignmentWithinDeclaration(
  assignment: AttributeAssignment,
  declaration: AttributeDeclaration,
  rootSetting = false,
): boolean {
  if (rootSetting)
    return (
      'ok' in
      judgeAgentDefinitionBody(
        copyJson({ references: [], attributes: [{ ...declaration, default: assignment.value }] }),
      )
    )
  if (declaration.kind === 'permission') {
    const value = permission(assignment.value)
    return (
      value !== undefined &&
      new Set(value.allowed).size === value.allowed.length &&
      value.allowed.every(token => declaration.domain.values.includes(token))
    )
  }
  const result = getAssetJudge().judgeAssetValue('AttributeDeclaration', {
    ...declaration,
    default: assignment.value,
  })
  if ('rejected' in result) return false
  return (
    'ok' in
    getAssetJudge().judgeAssetValue('AttributeAssignment', assignment, { declarations: [declaration] })
  )
}
/** A permission assignment takes part in S-23 when the effective asset declares the item as a permission, or when it is an outer bound on an item the effective asset lacks. */
function permissionParticipates(
  holding: AssetHolding,
  assignment: AttributeAssignment,
  declaration: PermissionDeclaration,
  effectiveDeclarations: readonly AttributeDeclaration[],
  current: Selected,
): boolean {
  const effective = effectiveDeclarations.find(entry => entry.item === assignment.item)
  if (effective?.kind === 'permission') return true
  const value = permission(assignment.value)
  return (
    effective === undefined &&
    (holding.holder.layer === 'organization' || holding.holder.layer === 'tenant') &&
    index(holding.holder.layer) < index(current.asset.from) &&
    (assignment.immutable ||
      (value !== undefined &&
        classifyPermissionAssignment(declaration, {
          value,
          immutable: assignment.immutable,
        }).role === 'bound'))
  )
}
/** Whether S-21／S-23 read this assignment at all: settings only on the effective asset, nothing a workspace may not set, permissions that take part. */
function assignmentRead(
  holding: AssetHolding,
  assignment: AttributeAssignment,
  declaration: AttributeDeclaration,
  effectiveDeclarations: readonly AttributeDeclaration[],
  current: Selected,
): boolean {
  if (declaration.kind === 'setting' && holding.asset !== current.definition.id) return false
  if (
    holding.holder.layer === 'workspace' &&
    (declaration.kind === 'permission' ||
      declaration.category === 'placement_identity' ||
      declaration.category === 'governance')
  )
    return false
  return (
    declaration.kind !== 'permission' ||
    permissionParticipates(holding, assignment, declaration, effectiveDeclarations, current)
  )
}
/** C10 over one in-effect holding: only assignments that S-21／S-23 actually read are judged. */
function holdingAssignmentsDiagnostic(
  holding: AssetHolding,
  root: CapabilityId,
  selection: Selection,
  facts: EvaluationFacts,
): InputDiagnostic | undefined {
  const definition = heldDefinition(selection.definitions, holding)
  const version = versionOf(holding, definition)
  if (version === undefined) return undefined
  const declared = declarationsFor(holding, facts)
  const current = selection.selected.get(key(holding.capability))
  if (current === undefined) throw new Error('composition has no selected asset')
  const effectiveDeclarations = declarationsFor(current.holding, facts)
  for (const assignment of holding.assignments) {
    const declaration = targetDeclaration(declared, holding.capability, assignment.item)
    if (declaration === undefined) continue
    if (!assignmentRead(holding, assignment, declaration, effectiveDeclarations, current)) continue
    if (!assignmentWithinDeclaration(assignment, declaration, same(holding.capability, root)))
      return diagnostic('C10', 'holding assignment outside its declaration domain')
  }
  return undefined
}
/** C10 over the in-effect holdings and the session, for capabilities the composition or the effective root uses. */
function assignmentsDiagnostic(
  input: NonConnectorEvaluationInput,
  root: CapabilityId,
  selection: Selection,
  facts: EvaluationFacts,
  participates: (capability: CapabilityId) => boolean,
): InputDiagnostic | undefined {
  for (const holding of selection.inEffect) {
    if (!participates(holding.capability)) continue
    const bad = holdingAssignmentsDiagnostic(holding, root, selection, facts)
    if (bad !== undefined) return bad
  }
  return sessionAssignmentsDiagnostic(input, root, selection.selected, facts, participates)
}
/** C10 over the session assignments, read against the effective asset's declarations. */
function sessionAssignmentsDiagnostic(
  input: NonConnectorEvaluationInput,
  root: CapabilityId,
  selected: ReadonlyMap<string, Selected>,
  facts: EvaluationFacts,
  participates: (capability: CapabilityId) => boolean,
): InputDiagnostic | undefined {
  for (const entry of input.session ?? []) {
    if (!participates(entry.capability)) continue
    const asset = selected.get(key(entry.capability))
    if (asset === undefined) continue
    const declaration = declarationsFor(asset.holding, facts).find(
      item => item.item === entry.assignment.item,
    )
    if (
      declaration !== undefined &&
      !assignmentWithinDeclaration(entry.assignment, declaration, same(entry.capability, root))
    )
      return diagnostic('C10', 'session assignment outside effective declaration domain')
  }
  return undefined
}

/** One capability's value computation scope: its effective asset, the declarations to value, and its in-effect holdings. */
interface CapabilityScope {
  readonly capability: CapabilityId
  readonly current: Selected
  readonly declared: readonly AttributeDeclaration[]
  readonly holdings: readonly AssetHolding[]
}
/** S-24: a workspace holding's permission, placement and governance assignments leave a trace instead of applying. */
function workspaceFilteredOut(
  scope: CapabilityScope,
  workspace: AssetHolding,
  filtered: FilteredOut[],
): void {
  const { capability } = scope
  for (const assignment of workspace.assignments) {
    const declaration = targetDeclaration(scope.declared, capability, assignment.item)
    if (declaration?.kind === 'permission')
      filtered.push({ capability, from: 'workspace', reason: 'workspace_permission' })
    else if (declaration?.category === 'placement_identity')
      filtered.push({ capability, from: 'workspace', reason: 'workspace_placement' })
    else if (declaration?.category === 'governance' && declaration.item !== 'disabled')
      filtered.push({ capability, from: 'workspace', reason: 'workspace_governance' })
  }
}
interface LayerAssignment {
  readonly layer: Layer
  readonly assignment: AttributeAssignment
}
/** The in-effect surviving holding of the effective asset at one layer, if that layer holds it. */
function effectiveHoldingAt(
  scope: CapabilityScope,
  selection: Selection,
  layer: Layer,
): AssetHolding | undefined {
  return selection.surviving.find(
    entry =>
      selection.inEffect.includes(entry) &&
      entry.holder.layer === layer &&
      same(entry.capability, scope.capability) &&
      entry.asset === scope.current.definition.id,
  )
}
/** S-22: the assignments of a setting along the setting order, only from holdings of the effective asset. */
function settingAssignments(
  input: NonConnectorEvaluationInput,
  scope: CapabilityScope,
  declaration: AttributeDeclaration,
  selection: Selection,
): LayerAssignment[] {
  const assigned: LayerAssignment[] = []
  for (const layer of ['organization', 'tenant', 'workspace'] as const) {
    const holding = effectiveHoldingAt(scope, selection, layer)
    const assignment = holding?.assignments.find(entry => entry.item === declaration.item)
    if (
      assignment !== undefined &&
      !(
        layer === 'workspace' &&
        (declaration.category === 'placement_identity' || declaration.category === 'governance')
      )
    )
      assigned.push({ layer, assignment })
  }
  const session = input.session?.find(
    entry => same(entry.capability, scope.capability) && entry.assignment.item === declaration.item,
  )
  if (session !== undefined) assigned.push({ layer: 'session', assignment: session.assignment })
  return assigned
}
/** S-22: a lock wins, else the innermost assignment, else the declared default; placement settings carry their provenance (S-40). */
function settingValue(
  input: NonConnectorEvaluationInput,
  scope: CapabilityScope,
  declaration: AttributeDeclaration,
  selection: Selection,
): EffectiveValue | undefined {
  const assigned = settingAssignments(input, scope, declaration, selection)
  const lock = assigned.find(entry => entry.assignment.immutable)
  const final = lock ?? assigned.at(-1)
  const value = final?.assignment.value ?? declaration.default
  if (value === undefined) return undefined
  return {
    capability: scope.capability,
    item: declaration.item,
    value,
    from: final?.layer ?? 'factory',
    ...(lock === undefined ? {} : { lockedAt: lock.layer }),
    ...(declaration.category === 'placement_identity'
      ? { provenance: final?.layer ?? scope.current.asset.from }
      : {}),
  }
}
/** S-23: a permission resolved across layers for the capability; execution permissions also say whether the tenant layer may write `auto` (S-42). */
function permissionValue(
  input: NonConnectorEvaluationInput,
  scope: CapabilityScope,
  declaration: PermissionDeclaration,
  selection: Selection,
  facts: EvaluationFacts,
): EffectiveValue {
  const { capability, current } = scope
  const resolved =
    declaration.item === 'usableBy'
      ? selection.usableValues.get(current.definition.id)
      : resolvePermission(
          declaration,
          assignmentsFor(
            input,
            capability,
            declaration,
            scope.holdings,
            selection.definitions,
            false,
            facts,
          ),
          current.asset.from === 'workspace' ? strictPermission(declaration) : undefined,
        )
  if (resolved === undefined) throw new Error('selected asset has no usableBy value')
  const tieredExecute = tiersOf(declaration)?.includes('auto') === true
  return {
    capability,
    item: declaration.item,
    value: copyJson(resolved.value),
    from: resolved.from,
    ...(resolved.lockedAt === undefined ? {} : { lockedAt: resolved.lockedAt }),
    ...(tieredExecute
      ? {
          tenantAutoWritable: tenantWritable(
            input,
            capability,
            current,
            declaration,
            selection.inEffect,
          ),
        }
      : {}),
  }
}
interface OuterBound {
  readonly declaration: PermissionDeclaration
  readonly bound: LayerPermissionAssignment
}
/** S-23 last clause: an outer holding's bound on a permission item the effective asset does not declare. */
function outerBound(
  holding: AssetHolding,
  assignment: AttributeAssignment,
  scope: CapabilityScope,
  facts: EvaluationFacts,
): OuterBound | undefined {
  if (scope.declared.some(entry => entry.item === assignment.item)) return undefined
  const declaration = targetDeclaration(
    declarationsFor(holding, facts),
    scope.capability,
    assignment.item,
  )
  const value = permission(assignment.value)
  if (
    declaration?.kind !== 'permission' ||
    value === undefined ||
    classifyPermissionAssignment(declaration, { value, immutable: assignment.immutable }).role !==
      'bound'
  )
    return undefined
  return {
    declaration,
    bound: { layer: holding.holder.layer, value, immutable: assignment.immutable },
  }
}
interface MissingPermission {
  readonly declarations: PermissionDeclaration[]
  readonly bounds: LayerPermissionAssignment[]
}
/** S-23 last clause: per missing item, the declarations and bounds the outer organization and tenant holdings contribute. */
function outerBoundsOnMissingItems(
  scope: CapabilityScope,
  selection: Selection,
  facts: EvaluationFacts,
): Map<string, MissingPermission> {
  const missing = new Map<string, MissingPermission>()
  for (const holding of scope.holdings) {
    if (
      (holding.holder.layer !== 'organization' && holding.holder.layer !== 'tenant') ||
      index(holding.holder.layer) >= index(scope.current.asset.from)
    )
      continue
    const definition = heldDefinition(selection.definitions, holding)
    const version = versionOf(holding, definition)
    if (version === undefined) continue
    for (const assignment of holding.assignments) {
      const found = outerBound(holding, assignment, scope, facts)
      if (found === undefined) continue
      const entry = missing.get(assignment.item) ?? { declarations: [], bounds: [] }
      entry.declarations.push(found.declaration)
      entry.bounds.push(found.bound)
      missing.set(assignment.item, entry)
    }
  }
  return missing
}
/** S-23 last clause: the strict constrained value an outer bound creates on a missing permission item. */
function missingPermissionValue(
  capability: CapabilityId,
  item: string,
  entry: MissingPermission,
): EffectiveValue {
  const first = entry.declarations[0]
  if (first === undefined) throw new Error('missing permission has no declaration')
  const strict = entry.declarations.every(
    declaration =>
      writeJsonLossless(strictPermission(declaration)) ===
      writeJsonLossless(strictPermission(first)),
  )
    ? strictPermission(first)
    : { allowed: [] }
  const allowed = strict.allowed.filter(token =>
    entry.bounds.every(bound => bound.value.allowed.includes(token)),
  )
  return {
    capability,
    item,
    value: copyJson({ allowed }),
    from: entry.bounds.at(-1)?.layer ?? 'factory',
    lockedAt: entry.bounds[0]?.layer ?? 'factory',
    ...(tiersOf(first)?.includes('auto') === true ? { tenantAutoWritable: false } : {}),
  }
}
/** S-21～S-24、S-42 for one capability of the composition or the effective root. */
function capabilityValues(
  input: NonConnectorEvaluationInput,
  capability: CapabilityId,
  selection: Selection,
  facts: EvaluationFacts,
): EffectiveValue[] {
  const root = input.root.definition
  const current = selection.selected.get(key(capability))
  if (current === undefined) throw new Error('composition is outside selected assets')
  const scope: CapabilityScope = {
    capability,
    current,
    declared: declarationsFor(current.holding, facts).filter(
      entry => entry.item !== 'disabled' && !(same(capability, root) && entry.item === 'usableBy'),
    ),
    holdings: selection.inEffect.filter(holding => same(holding.capability, capability)),
  }
  const workspace = scope.holdings.find(holding => holding.holder.layer === 'workspace')
  if (workspace !== undefined) workspaceFilteredOut(scope, workspace, selection.filtered)
  const values: EffectiveValue[] = []
  for (const declaration of scope.declared) {
    if (declaration.kind === 'setting') {
      const value = settingValue(input, scope, declaration, selection)
      if (value !== undefined) values.push(value)
    } else values.push(permissionValue(input, scope, declaration, selection, facts))
  }
  for (const [item, entry] of outerBoundsOnMissingItems(scope, selection, facts))
    values.push(missingPermissionValue(capability, item, entry))
  return values
}
/** S-38: tool and skill assets in the composition carry the root reference's resident flag. */
function withResident(
  entry: Selected,
  composition: ReadonlyMap<string, CapabilityId>,
  references: readonly AssetReference[],
): EffectiveAsset {
  if (
    !composition.has(key(entry.asset.capability)) ||
    (entry.asset.capability.category !== 'skill' && entry.asset.capability.category !== 'tool')
  )
    return entry.asset
  return {
    ...entry.asset,
    resident:
      references.find(reference => same(reference.capability, entry.asset.capability))?.resident ??
      false,
  }
}
const unique = <T>(list: readonly T[]): T[] => [
  ...new Map(list.map(entry => [canonical(copyJson(entry)), entry])).values(),
]
const ordered = <T>(list: readonly T[], capabilityOf: (entry: T) => CapabilityId): T[] =>
  unique(list).sort(
    (a, b) =>
      codePointCompare(key(capabilityOf(a)), key(capabilityOf(b))) ||
      codePointCompare(canonical(copyJson(a)), canonical(copyJson(b))),
  )

export function computeEvaluation(
  input: NonConnectorEvaluationInput,
  facts: EvaluationFacts,
): EvaluationResult {
  const inconsistent = mcpActionSetsDiagnostic(input) ?? rootReferencesDiagnostic(input.root)
  if (inconsistent !== undefined) return invalidInput(inconsistent)
  const selection = selectAssets({ ...input, rootDefinition: input.root.definition }, facts)
  if ('invalidInput' in selection) return selection
  const root = input.root.definition
  const { selected } = selection
  const mismatch = rootSourceDiagnostic(input.root, selected.get(key(root)))
  if (mismatch !== undefined) return invalidInput(mismatch)
  const composed = compose(input, selected, facts)
  // C10 admits only assignments used by composition or the selected root.
  const participates = (capability: CapabilityId): boolean =>
    composed.composition.has(key(capability)) || (selected.has(key(root)) && same(capability, root))
  const outsideDomain = assignmentsDiagnostic(input, root, selection, facts, participates)
  if (outsideDomain !== undefined) return invalidInput(outsideDomain)
  if (composed.cycle !== undefined)
    return immutable({ compositionCycle: { cycle: composed.cycle.map(entry => ({ ...entry })) } })
  if (composed.unsupported !== undefined)
    return immutable({ categoryUnsupported: { category: composed.unsupported } })
  const values = [
    ...(selected.has(key(root)) ? [root] : []),
    ...composed.composition.values(),
  ].flatMap(capability => capabilityValues(input, capability, selection, facts))
  const assets = [...selected.values()].map(entry =>
    withResident(entry, composed.composition, input.root.references),
  )
  const assembly: EffectiveAssembly = {
    root: { ...root },
    assets: ordered(assets, entry => entry.capability),
    composition: ordered(
      [...composed.composition.values()].map(entry => ({ ...entry })),
      entry => entry,
    ),
    values: ordered(values, entry => entry.capability),
    filteredOut: ordered(selection.filtered, entry => entry.capability),
    unresolved: ordered(composed.unresolved, entry => entry.capability),
  }
  // Copy every nested value before freezing: input ownership stays with the caller.
  return immutable({ ok: cloneAssembly(assembly) })
}
/** S-42: whether the tenant layer could now write an unlocked `{auto}` for this tool's execution permission. */
function tenantWritable(
  input: NonConnectorEvaluationInput,
  capability: CapabilityId,
  selected: Selected,
  declaration: PermissionDeclaration,
  inEffect: readonly AssetHolding[],
): boolean {
  if (capability.category !== 'tool' || selected.asset.from === 'workspace') return false
  if (organizationBoundExcludesAuto(input, capability, declaration)) return false
  return tenantHoldingAdmitsAutoPick(input, capability, selected, declaration, inEffect)
}
/** S-42 clause 3: the organization layer's bound on this item leaves no room for `auto`. */
function organizationBoundExcludesAuto(
  input: NonConnectorEvaluationInput,
  capability: CapabilityId,
  declaration: PermissionDeclaration,
): boolean {
  const organization = input.holdings.find(
    holding => holding.holder.layer === 'organization' && same(holding.capability, capability),
  )
  const assignment = organization?.assignments.find(entry => entry.item === declaration.item)
  if (assignment === undefined) return false
  const value = permission(assignment.value)
  return (
    value !== undefined &&
    classifyPermissionAssignment(declaration, { value, immutable: assignment.immutable }).role ===
      'bound' &&
    !value.allowed.includes('auto')
  )
}
/** S-42 clauses 2 and 4: no tenant holding, or one in effect on the effective asset without a lock on this item. */
function tenantHoldingAdmitsAutoPick(
  input: NonConnectorEvaluationInput,
  capability: CapabilityId,
  selected: Selected,
  declaration: PermissionDeclaration,
  inEffect: readonly AssetHolding[],
): boolean {
  const tenant = input.holdings.find(
    holding => holding.holder.layer === 'tenant' && same(holding.capability, capability),
  )
  return (
    tenant === undefined ||
    (inEffect.includes(tenant) &&
      tenant.asset === selected.definition.id &&
      !tenant.assignments.some(entry => entry.item === declaration.item && entry.immutable))
  )
}
function cloneAssembly(assembly: EffectiveAssembly): EffectiveAssembly {
  return {
    root: { ...assembly.root },
    assets: assembly.assets.map(entry => ({
      ...entry,
      capability: { ...entry.capability },
      replaced: [...entry.replaced],
    })),
    composition: assembly.composition.map(entry => ({ ...entry })),
    values: assembly.values.map(entry => ({
      ...entry,
      capability: { ...entry.capability },
      value: copyJson(entry.value),
    })),
    filteredOut: assembly.filteredOut.map(entry => ({
      ...entry,
      capability: { ...entry.capability },
    })),
    unresolved: assembly.unresolved.map(entry => ({
      capability: { ...entry.capability },
      ...(entry.referencedBy === undefined ? {} : { referencedBy: { ...entry.referencedBy } }),
    })),
  }
}
