import {
  type AssetDefinition,
  type AssetHolding,
  type AttributeAssignment,
  type PermissionValue,
} from '@omne-harness-lite/asset-model'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { diagnostic, invalidInput, type InvalidInput } from './diagnostics.ts'
import {
  assignmentsFor,
  byLayer,
  heldDefinition,
  index,
  key,
  layers,
  permission,
  same,
  usableBy,
  versionOf,
  type EvaluationFacts,
  type Selected,
} from './holdings.ts'
import { own } from './json.ts'
import { resolvePermission, strictPermission, type PermissionResolution } from './permissions.ts'
import type { EvaluationRootSelectionInput, FilteredOut, InputDiagnostic } from './types.ts'

/** The first step's outcome, shared by the complete evaluation and the root source selector. */
export interface Selection {
  readonly selected: ReadonlyMap<string, Selected>
  readonly inEffect: readonly AssetHolding[]
  readonly surviving: readonly AssetHolding[]
  readonly definitions: ReadonlyMap<string, AssetDefinition>
  readonly usableValues: ReadonlyMap<string, PermissionResolution>
  readonly filtered: FilteredOut[]
}

/** C3 for one holding: it belongs to this evaluation's organization, tenant or workspace. */
function holdingOutsideScopes(holding: AssetHolding, input: EvaluationRootSelectionInput): boolean {
  const holder = holding.holder
  return (
    (holder.layer === 'organization' && holder.organization !== input.tenant.organization) ||
    (holder.layer === 'tenant' && !tenantIdEquals(holder.tenant, input.tenant)) ||
    (holder.layer === 'workspace' &&
      (input.workspace === undefined ||
        holder.workspace.directory !== input.workspace.directory ||
        !tenantIdEquals(holder.workspace.tenant, input.workspace.tenant)))
  )
}
/** C2～C4: the root's category, every scope against the input's tenant and workspace, one holding per scope and capability. */
function scopeDiagnostic(input: EvaluationRootSelectionInput): InputDiagnostic | undefined {
  if (input.rootDefinition.category !== 'agent_definition')
    return diagnostic('C2', 'root is not an Agent Definition')
  if (input.workspace !== undefined && !tenantIdEquals(input.workspace.tenant, input.tenant))
    return diagnostic('C3', 'workspace tenant')
  if (input.holdings.some(holding => holdingOutsideScopes(holding, input)))
    return diagnostic('C3', 'holding outside input scopes')
  const holdingKeys = input.holdings.map(
    holding => `${holding.holder.layer}:${key(holding.capability)}`,
  )
  if (new Set(holdingKeys).size !== holdingKeys.length)
    return diagnostic('C4', 'duplicate scope holding')
  return undefined
}
function assignedDisabled(holding: AssetHolding): boolean {
  return holding.assignments.some(entry => entry.item === 'disabled' && entry.value === true)
}
/** C5: the one definition the holding points to, carrying the holding's capability. */
function matchingDefinition(
  holding: AssetHolding,
  input: EvaluationRootSelectionInput,
  definitions: ReadonlyMap<string, AssetDefinition>,
): AssetDefinition | undefined {
  const definition = definitions.get(holding.asset)
  return definition !== undefined &&
    input.definitions.filter(entry => entry.id === holding.asset).length === 1 &&
    same(definition.capability, holding.capability)
    ? definition
    : undefined
}
/** C5～C8 for one holding: a unique matching definition, factory and official rules, workspace exclusivity. */
function heldDefinitionDiagnostic(
  holding: AssetHolding,
  input: EvaluationRootSelectionInput,
  definitions: ReadonlyMap<string, AssetDefinition>,
): InputDiagnostic | undefined {
  const definition = matchingDefinition(holding, input, definitions)
  if (definition === undefined)
    return diagnostic('C5', 'held asset has no unique matching definition')
  if (
    holding.holder.layer === 'factory' &&
    (definition.origin !== 'official' || holding.assignments.length !== 0)
  )
    return diagnostic('C6', 'factory holds only unassigned official assets')
  if (definition.origin === 'official' && assignedDisabled(holding))
    return diagnostic('C7', 'official disabled')
  if (
    holding.holder.layer === 'workspace' &&
    input.holdings.some(
      entry => entry.holder.layer !== 'workspace' && entry.asset === holding.asset,
    )
  )
    return diagnostic('C8', 'workspace asset also held outside workspace')
  return undefined
}
/** C11、C12: one session assignment per capability and item; the membership is effective. */
function sessionAndStandingDiagnostic(
  input: EvaluationRootSelectionInput,
): InputDiagnostic | undefined {
  const sessionKeys =
    input.session?.map(entry => `${key(entry.capability)}:${entry.assignment.item}`) ?? []
  if (new Set(sessionKeys).size !== sessionKeys.length)
    return diagnostic('C11', 'duplicate session assignment')
  if (input.standing.standing !== 'effective') return diagnostic('C12', 'ineffective membership')
  return undefined
}
/** C5～C8、C11、C12 in the contract's order; the first violated condition is the diagnostic. */
function definitionsDiagnostic(
  input: EvaluationRootSelectionInput,
  definitions: ReadonlyMap<string, AssetDefinition>,
): InputDiagnostic | undefined {
  for (const holding of input.holdings) {
    const bad = heldDefinitionDiagnostic(holding, input, definitions)
    if (bad !== undefined) return bad
  }
  return sessionAndStandingDiagnostic(input)
}
/** S-17 third clause: a workspace-provided stdio MCP endpoint or command loop extension is disabled by default. */
function launchesLocalCommand(definition: AssetDefinition | undefined): boolean {
  const content = definition?.versions[0]?.content
  return (
    (content?.category === 'mcp' && own(own(content.body, 'transport'), 'kind') === 'stdio') ||
    (content?.category === 'loop_extension' &&
      own(own(content.extension, 'implementation'), 'kind') === 'command')
  )
}
/** S-17: the assets disabled in this evaluation, by any holding's `disabled` or by the workspace default. */
function disabledAssets(
  input: EvaluationRootSelectionInput,
  definitions: ReadonlyMap<string, AssetDefinition>,
): Set<string> {
  const disabled = new Set<string>()
  for (const holding of input.holdings) {
    if (assignedDisabled(holding)) disabled.add(holding.asset)
    if (
      holding.holder.layer === 'workspace' &&
      launchesLocalCommand(definitions.get(holding.asset))
    )
      disabled.add(holding.asset)
  }
  return disabled
}
function usableWithinDomain(assignment: AttributeAssignment): boolean {
  const value = permission(assignment.value)
  return (
    value !== undefined &&
    new Set(value.allowed).size === value.allowed.length &&
    value.allowed.every(token => usableBy.domain.values.includes(token))
  )
}
/** C10 for the reserved `usableBy` item on live holdings outside the workspace and on session assignments. */
function usableByDiagnostic(
  input: EvaluationRootSelectionInput,
  live: readonly AssetHolding[],
): InputDiagnostic | undefined {
  for (const holding of live)
    if (holding.holder.layer !== 'workspace') {
      const assignment = holding.assignments.find(entry => entry.item === 'usableBy')
      if (assignment !== undefined && !usableWithinDomain(assignment))
        return diagnostic('C10', 'usableBy assignment outside declaration domain')
    }
  for (const entry of input.session ?? [])
    if (
      entry.assignment.item === 'usableBy' &&
      live.some(holding => same(holding.capability, entry.capability)) &&
      !usableWithinDomain(entry.assignment)
    )
      return diagnostic('C10', 'session usableBy outside declaration domain')
  return undefined
}
/** S-39: this tenant may use the held asset — official, its role is allowed, or `self` names the author (a workspace asset is the tenant's own). */
function tenantMayUse(
  input: EvaluationRootSelectionInput,
  holding: AssetHolding,
  definition: AssetDefinition,
  usable: PermissionValue,
): boolean {
  return (
    definition.origin === 'official' ||
    usable.allowed.includes(input.standing.standing === 'effective' ? input.standing.role : '') ||
    (usable.allowed.includes('self') &&
      (holding.holder.layer === 'workspace' || tenantIdEquals(definition.author, input.tenant)))
  )
}
/** S-39 over the live holdings: resolves each holding's usableBy value and drops what this tenant cannot use. */
function usableHoldings(
  input: EvaluationRootSelectionInput,
  live: readonly AssetHolding[],
  definitions: ReadonlyMap<string, AssetDefinition>,
  facts: EvaluationFacts,
  filtered: FilteredOut[],
): Pick<Selection, 'surviving' | 'usableValues'> {
  const usableValues = new Map<string, PermissionResolution>()
  const surviving = live.filter(holding => {
    const definition = heldDefinition(definitions, holding)
    const value = resolvePermission(
      usableBy,
      assignmentsFor(input, holding.capability, usableBy, live, definitions, true, facts),
      holding.holder.layer === 'workspace' ? strictPermission(usableBy) : undefined,
    )
    usableValues.set(holding.asset, value)
    if (tenantMayUse(input, holding, definition, value.value)) return true
    filtered.push({
      capability: holding.capability,
      from: holding.holder.layer,
      reason: 'not_usable',
    })
    return false
  })
  return { surviving, usableValues }
}
/** S-18 clauses 1 and 2: the outermost lock per capability and the holdings it leaves in effect. */
function lockedHoldings(
  live: readonly AssetHolding[],
  surviving: readonly AssetHolding[],
  filtered: FilteredOut[],
): {
  readonly locks: ReadonlyMap<string, AssetHolding>
  readonly inEffect: readonly AssetHolding[]
} {
  const locks = new Map<string, AssetHolding>()
  for (const holding of [...surviving].sort(byLayer))
    if (holding.immutable && !locks.has(key(holding.capability)))
      locks.set(key(holding.capability), holding)
  const inEffect = live.filter(holding => {
    const lock = locks.get(key(holding.capability))
    return (
      lock === undefined ||
      index(holding.holder.layer) <= index(lock.holder.layer) ||
      holding.asset === lock.asset
    )
  })
  for (const holding of surviving)
    if (!inEffect.includes(holding))
      filtered.push({
        capability: holding.capability,
        from: holding.holder.layer,
        reason: 'locked_below',
      })
  return { locks, inEffect }
}
/** C9 on every in-effect holding outside the workspace: its version selection resolves. */
function versionDiagnostic(
  inEffect: readonly AssetHolding[],
  definitions: ReadonlyMap<string, AssetDefinition>,
): InputDiagnostic | undefined {
  for (const holding of inEffect) {
    const definition = heldDefinition(definitions, holding)
    if (holding.holder.layer !== 'workspace' && versionOf(holding, definition) === undefined)
      return diagnostic('C9', 'version selection cannot resolve')
  }
  return undefined
}
/** S-18 clause 3: the EffectiveAsset a candidate holding yields, with the outer layers it replaced. */
function effectiveSelection(
  holding: AssetHolding,
  definition: AssetDefinition,
  version: Selected['version'],
  lock: AssetHolding | undefined,
  candidates: readonly AssetHolding[],
): Selected {
  const replaced = layers.filter(layer =>
    candidates.some(
      entry =>
        same(entry.capability, holding.capability) &&
        entry.holder.layer === layer &&
        index(layer) < index(holding.holder.layer) &&
        entry.asset !== holding.asset,
    ),
  )
  return {
    holding,
    definition,
    version,
    asset: {
      capability: holding.capability,
      asset: holding.asset,
      version: version.number,
      from: holding.holder.layer,
      replaced,
      ...(lock === undefined ? {} : { lockedAt: lock.holder.layer }),
    },
  }
}

/** The first step (S-17、S-39、S-18) with the consistency conditions it needs; shared by evaluate and selectEvaluationRootSource. */
export function selectAssets(
  input: EvaluationRootSelectionInput,
  facts: EvaluationFacts,
): Selection | InvalidInput {
  const outOfScope = scopeDiagnostic(input)
  if (outOfScope !== undefined) return invalidInput(outOfScope)
  // Built only after C2～C4, as before: a malformed definition entry must not throw ahead of them.
  const definitions = new Map(input.definitions.map(definition => [definition.id, definition]))
  const inconsistent = definitionsDiagnostic(input, definitions)
  if (inconsistent !== undefined) return invalidInput(inconsistent)
  const filtered: FilteredOut[] = []
  const disabled = disabledAssets(input, definitions)
  const live = input.holdings.filter(holding => !disabled.has(holding.asset))
  for (const holding of input.holdings)
    if (disabled.has(holding.asset))
      filtered.push({
        capability: holding.capability,
        from: holding.holder.layer,
        reason: 'disabled',
      })
  const unusable = usableByDiagnostic(input, live)
  if (unusable !== undefined) return invalidInput(unusable)
  const { surviving, usableValues } = usableHoldings(input, live, definitions, facts, filtered)
  const { locks, inEffect } = lockedHoldings(live, surviving, filtered)
  const unresolvable = versionDiagnostic(inEffect, definitions)
  if (unresolvable !== undefined) return invalidInput(unresolvable)
  const candidates = surviving.filter(entry => inEffect.includes(entry)).sort(byLayer)
  const selected = new Map<string, Selected>()
  for (const holding of candidates) {
    const definition = heldDefinition(definitions, holding)
    const version = versionOf(holding, definition)
    if (version === undefined)
      return invalidInput(diagnostic('C9', 'selected asset has no published version'))
    selected.set(
      key(holding.capability),
      effectiveSelection(
        holding,
        definition,
        version,
        locks.get(key(holding.capability)),
        candidates,
      ),
    )
  }
  return { selected, inEffect, surviving, definitions, usableValues, filtered }
}
