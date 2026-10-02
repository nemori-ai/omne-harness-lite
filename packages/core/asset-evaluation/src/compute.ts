import {
  capabilityCanonicalString,
  USABLE_BY_DECLARATION,
  type AssetDefinition,
  type AssetHolding,
  type AssetVersion,
  type AttributeDeclaration,
  type AttributeAssignment,
  type CapabilityId,
  type PermissionValue,
} from '@omne-harness-lite/asset-model'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeAgentDefinitionBody } from '@omne-harness-lite/agent-definition'
import { assetJudge } from './defaults.ts'
import { diagnostic, invalidInput } from './diagnostics.ts'
import { canonical, copyJson, immutable, object, own, codePointCompare } from './json.ts'
import {
  classifyPermissionAssignment,
  resolvePermission,
  strictPermission,
  tiersOf,
  type LayerPermissionAssignment,
} from './permissions.ts'
import type {
  EffectiveAssembly,
  EffectiveAsset,
  EffectiveValue,
  EvaluationResult,
  EvaluationRootSelectionInput,
  FilteredOut,
  HoldingLayer,
  Layer,
  NonConnectorEvaluationInput,
  PermissionDeclaration,
  Unresolved,
} from './types.ts'

/** Internal projection values, keyed by the admitted holding and selected body version. Not a domain object or provider port. */
export interface EvaluationFacts {
  readonly declarations: ReadonlyMap<AssetHolding, readonly AttributeDeclaration[]>
  readonly references: ReadonlyMap<AssetVersion, readonly CapabilityId[]>
}

const usableBy: PermissionDeclaration = (() => {
  if (USABLE_BY_DECLARATION.kind !== 'permission')
    throw new Error('reserved usableBy declaration must be a permission')
  return USABLE_BY_DECLARATION
})()
const layers: readonly HoldingLayer[] = ['factory', 'organization', 'tenant', 'workspace']
const index = (layer: Layer): number => (layer === 'session' ? 4 : layers.indexOf(layer))
const key = capabilityCanonicalString
const same = (a: CapabilityId, b: CapabilityId): boolean => key(a) === key(b)

interface Selected {
  readonly holding: AssetHolding
  readonly definition: AssetDefinition
  readonly version: AssetVersion
  readonly asset: EffectiveAsset
}
export function versionOf(
  holding: AssetHolding,
  definition: AssetDefinition,
): AssetVersion | undefined {
  return holding.versionSelection.kind === 'current'
    ? definition.versions.at(-1)
    : definition.versions.find(
        version =>
          holding.versionSelection.kind === 'pinned' &&
          ExactDecimal.from(version.number).compare(
            ExactDecimal.from(holding.versionSelection.number),
          ) === 0,
      )
}
function permission(value: unknown): PermissionValue | undefined {
  if (
    !object(value) ||
    !Array.isArray(value.allowed) ||
    value.allowed.some(token => typeof token !== 'string')
  )
    return undefined
  // This local representation is only a projection after checking every token.
  return { allowed: value.allowed.filter((token): token is string => typeof token === 'string') }
}
function mcpExecute(item: string): PermissionDeclaration | undefined {
  return item.startsWith('execute:')
    ? {
        item,
        kind: 'permission',
        domain: { kind: 'enum', values: ['forbid', 'auto', 'ask'] },
        default: 'ask',
      }
    : undefined
}
function declarationsFor(
  holding: AssetHolding,
  facts: EvaluationFacts,
): readonly AttributeDeclaration[] {
  return facts.declarations.get(holding) ?? [USABLE_BY_DECLARATION]
}
function assignmentsFor(
  input: Pick<NonConnectorEvaluationInput, 'tenant' | 'session'>,
  capability: CapabilityId,
  declaration: PermissionDeclaration,
  holdings: readonly AssetHolding[],
  definitions: ReadonlyMap<string, AssetDefinition>,
  specialUsable: boolean,
  facts: EvaluationFacts,
): LayerPermissionAssignment[] {
  const result: LayerPermissionAssignment[] = []
  for (const layer of ['organization', 'tenant'] as const) {
    const holding = holdings.find(
      entry => entry.holder.layer === layer && same(entry.capability, capability),
    )
    if (holding === undefined) continue
    const assignment = holding.assignments.find(entry => entry.item === declaration.item)
    if (assignment === undefined) continue
    const definition = definitions.get(holding.asset)
    if (definition === undefined) throw new Error('admitted holding has no definition')
    const version = versionOf(holding, definition)
    const sourceDeclaration = specialUsable
      ? USABLE_BY_DECLARATION
      : capability.category === 'mcp'
        ? (mcpExecute(declaration.item) ??
          (version === undefined
            ? undefined
            : declarationsFor(holding, facts).find(entry => entry.item === declaration.item)))
        : version === undefined
          ? undefined
          : declarationsFor(holding, facts).find(entry => entry.item === declaration.item)
    if (sourceDeclaration?.kind !== 'permission') continue
    const value = permission(assignment.value)
    if (value === undefined) continue
    result.push({ layer, value, immutable: assignment.immutable })
  }
  const session = input.session?.find(
    entry => same(entry.capability, capability) && entry.assignment.item === declaration.item,
  )
  if (session !== undefined) {
    const value = permission(session.assignment.value)
    if (value !== undefined)
      result.push({ layer: 'session', value, immutable: session.assignment.immutable })
  }
  return result
}

export function selectAssets(input: EvaluationRootSelectionInput, facts: EvaluationFacts) {
  if (input.rootDefinition.category !== 'agent_definition')
    return invalidInput(diagnostic('C2', 'root is not an Agent Definition'))
  if (input.workspace !== undefined && !tenantIdEquals(input.workspace.tenant, input.tenant))
    return invalidInput(diagnostic('C3', 'workspace tenant'))
  for (const holding of input.holdings) {
    const holder = holding.holder
    if (
      (holder.layer === 'organization' && holder.organization !== input.tenant.organization) ||
      (holder.layer === 'tenant' && !tenantIdEquals(holder.tenant, input.tenant)) ||
      (holder.layer === 'workspace' &&
        (input.workspace === undefined ||
          holder.workspace.directory !== input.workspace.directory ||
          !tenantIdEquals(holder.workspace.tenant, input.workspace.tenant)))
    )
      return invalidInput(diagnostic('C3', 'holding outside input scopes'))
  }
  const holdingKeys = input.holdings.map(
    holding => `${holding.holder.layer}:${key(holding.capability)}`,
  )
  if (new Set(holdingKeys).size !== holdingKeys.length)
    return invalidInput(diagnostic('C4', 'duplicate scope holding'))
  const definitions = new Map<string, AssetDefinition>()
  for (const definition of input.definitions) {
    definitions.set(definition.id, definition)
  }
  for (const holding of input.holdings) {
    const definition = definitions.get(holding.asset)
    if (
      definition === undefined ||
      input.definitions.filter(entry => entry.id === holding.asset).length !== 1 ||
      !same(definition.capability, holding.capability)
    )
      return invalidInput(diagnostic('C5', 'held asset has no unique matching definition'))
    if (
      holding.holder.layer === 'factory' &&
      (definition.origin !== 'official' || holding.assignments.length !== 0)
    )
      return invalidInput(diagnostic('C6', 'factory holds only unassigned official assets'))
    if (
      definition.origin === 'official' &&
      holding.assignments.some(entry => entry.item === 'disabled' && entry.value === true)
    )
      return invalidInput(diagnostic('C7', 'official disabled'))
    if (
      holding.holder.layer === 'workspace' &&
      input.holdings.some(
        entry => entry.holder.layer !== 'workspace' && entry.asset === holding.asset,
      )
    )
      return invalidInput(diagnostic('C8', 'workspace asset also held outside workspace'))
  }
  const sessionKeys =
    input.session?.map(entry => `${key(entry.capability)}:${entry.assignment.item}`) ?? []
  if (new Set(sessionKeys).size !== sessionKeys.length)
    return invalidInput(diagnostic('C11', 'duplicate session assignment'))
  if (input.standing.standing !== 'effective')
    return invalidInput(diagnostic('C12', 'ineffective membership'))
  const filtered: FilteredOut[] = []
  const disabled = new Set<string>()
  for (const holding of input.holdings) {
    if (holding.assignments.some(entry => entry.item === 'disabled' && entry.value === true))
      disabled.add(holding.asset)
    if (holding.holder.layer === 'workspace') {
      const definition = definitions.get(holding.asset)
      const content = definition?.versions[0]?.content
      if (
        (content?.category === 'mcp' && own(own(content.body, 'transport'), 'kind') === 'stdio') ||
        (content?.category === 'loop_extension' &&
          own(own(content.extension, 'implementation'), 'kind') === 'command')
      )
        disabled.add(holding.asset)
    }
  }
  const live = input.holdings.filter(holding => !disabled.has(holding.asset))
  for (const holding of input.holdings)
    if (disabled.has(holding.asset))
      filtered.push({
        capability: holding.capability,
        from: holding.holder.layer,
        reason: 'disabled',
      })
  const usableValid = (assignment: AttributeAssignment): boolean => {
    const value = permission(assignment.value)
    return (
      value !== undefined &&
      new Set(value.allowed).size === value.allowed.length &&
      value.allowed.every(token => usableBy.domain.values.includes(token))
    )
  }
  for (const holding of live)
    if (holding.holder.layer !== 'workspace') {
      const assignment = holding.assignments.find(entry => entry.item === 'usableBy')
      if (assignment !== undefined && !usableValid(assignment))
        return invalidInput(diagnostic('C10', 'usableBy assignment outside declaration domain'))
    }
  for (const entry of input.session ?? [])
    if (
      entry.assignment.item === 'usableBy' &&
      live.some(holding => same(holding.capability, entry.capability)) &&
      !usableValid(entry.assignment)
    )
      return invalidInput(diagnostic('C10', 'session usableBy outside declaration domain'))
  const usableValues = new Map<string, ReturnType<typeof resolvePermission>>()
  const surviving = live.filter(holding => {
    const definition = definitions.get(holding.asset)
    if (definition === undefined) throw new Error('C5 invariant')
    const value = resolvePermission(
      usableBy,
      assignmentsFor(input, holding.capability, usableBy, live, definitions, true, facts),
      holding.holder.layer === 'workspace' ? strictPermission(usableBy) : undefined,
    )
    usableValues.set(holding.asset, value)
    if (
      definition.origin === 'official' ||
      value.value.allowed.includes(
        input.standing.standing === 'effective' ? input.standing.role : '',
      ) ||
      (value.value.allowed.includes('self') &&
        (holding.holder.layer === 'workspace' || tenantIdEquals(definition.author, input.tenant)))
    )
      return true
    filtered.push({
      capability: holding.capability,
      from: holding.holder.layer,
      reason: 'not_usable',
    })
    return false
  })
  const locks = new Map<string, AssetHolding>()
  for (const holding of [...surviving].sort(
    (left, right) => index(left.holder.layer) - index(right.holder.layer),
  ))
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
  const selected = new Map<string, Selected>()
  for (const holding of inEffect) {
    const definition = definitions.get(holding.asset)
    if (definition === undefined) throw new Error('C5 invariant')
    if (holding.holder.layer !== 'workspace' && versionOf(holding, definition) === undefined)
      return invalidInput(diagnostic('C9', 'version selection cannot resolve'))
  }
  for (const holding of [...surviving]
    .filter(entry => inEffect.includes(entry))
    .sort((left, right) => index(left.holder.layer) - index(right.holder.layer))) {
    const definition = definitions.get(holding.asset)
    if (definition === undefined) throw new Error('C5 invariant')
    const version = versionOf(holding, definition)
    if (version === undefined)
      return invalidInput(diagnostic('C9', 'selected asset has no published version'))
    const lock = locks.get(key(holding.capability))
    const replaced = layers.filter(layer =>
      surviving.some(
        entry =>
          inEffect.includes(entry) &&
          same(entry.capability, holding.capability) &&
          entry.holder.layer === layer &&
          index(layer) < index(holding.holder.layer) &&
          entry.asset !== holding.asset,
      ),
    )
    selected.set(key(holding.capability), {
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
    })
  }
  return { selected, inEffect, surviving, definitions, usableValues, filtered }
}

export function computeEvaluation(
  input: NonConnectorEvaluationInput,
  facts: EvaluationFacts,
): EvaluationResult {
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
      return invalidInput(diagnostic('C13', 'invalid MCP action set'))
    actionKeys.add(token)
  }
  const refs = input.root.references.map(entry => key(entry.capability))
  if (
    new Set(refs).size !== refs.length ||
    input.root.references.some(
      entry =>
        entry.resident !== undefined &&
        entry.capability.category !== 'tool' &&
        entry.capability.category !== 'skill',
    )
  )
    return invalidInput(diagnostic('C14', 'invalid root references'))
  const selection = selectAssets({ ...input, rootDefinition: input.root.definition }, facts)
  if ('invalidInput' in selection) return selection
  const { selected, inEffect, surviving, definitions, usableValues, filtered } = selection
  const selectedRoot = selected.get(key(input.root.definition))
  if (
    selectedRoot !== undefined &&
    (input.root.source.asset !== selectedRoot.definition.id ||
      ExactDecimal.from(input.root.source.version).compare(
        ExactDecimal.from(selectedRoot.version.number),
      ) !== 0)
  )
    return invalidInput(diagnostic('C16', 'root source differs from the selected asset version'))
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
  // C10 admits only assignments used by composition or the selected root.
  const validAssignment = (
    assignment: AttributeAssignment,
    declaration: AttributeDeclaration,
    rootSetting = false,
  ): boolean => {
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
    const result = assetJudge.judgeAssetValue('AttributeDeclaration', {
      ...declaration,
      default: assignment.value,
    })
    if ('rejected' in result) return false
    return (
      'ok' in
      assetJudge.judgeAssetValue('AttributeAssignment', assignment, { declarations: [declaration] })
    )
  }
  for (const holding of inEffect) {
    if (
      !composition.has(key(holding.capability)) &&
      !(selected.has(key(root)) && same(holding.capability, root))
    )
      continue
    const definition = definitions.get(holding.asset)
    if (definition === undefined) throw new Error('C5 invariant')
    const version = versionOf(holding, definition)
    if (version === undefined) continue
    const declared = declarationsFor(holding, facts)
    const current = selected.get(key(holding.capability))
    if (current === undefined) throw new Error('composition has no selected asset')
    const effectiveDeclarations = declarationsFor(current.holding, facts)
    for (const assignment of holding.assignments) {
      const declaration =
        declared.find(entry => entry.item === assignment.item) ??
        (holding.capability.category === 'mcp' ? mcpExecute(assignment.item) : undefined)
      if (declaration === undefined) continue
      if (declaration.kind === 'setting' && holding.asset !== current.definition.id) continue
      if (
        holding.holder.layer === 'workspace' &&
        (declaration.kind === 'permission' ||
          declaration.category === 'placement_identity' ||
          declaration.category === 'governance')
      )
        continue
      if (declaration.kind === 'permission') {
        const effective = effectiveDeclarations.find(entry => entry.item === assignment.item)
        if (effective?.kind !== 'permission') {
          const value = permission(assignment.value)
          const missingBound =
            effective === undefined &&
            (holding.holder.layer === 'organization' || holding.holder.layer === 'tenant') &&
            index(holding.holder.layer) < index(current.asset.from) &&
            (assignment.immutable ||
              (value !== undefined &&
                classifyPermissionAssignment(declaration, {
                  value,
                  immutable: assignment.immutable,
                }).role === 'bound'))
          if (!missingBound) continue
        }
      }
      if (!validAssignment(assignment, declaration, same(holding.capability, root)))
        return invalidInput(diagnostic('C10', 'holding assignment outside its declaration domain'))
    }
  }
  for (const entry of input.session ?? []) {
    if (
      !composition.has(key(entry.capability)) &&
      !(selected.has(key(root)) && same(entry.capability, root))
    )
      continue
    const asset = selected.get(key(entry.capability))
    if (asset === undefined) continue
    const declaration = declarationsFor(asset.holding, facts).find(
      item => item.item === entry.assignment.item,
    )
    if (
      declaration !== undefined &&
      !validAssignment(entry.assignment, declaration, same(entry.capability, root))
    )
      return invalidInput(
        diagnostic('C10', 'session assignment outside effective declaration domain'),
      )
  }
  if (cycle !== undefined)
    return immutable({ compositionCycle: { cycle: cycle.map(entry => ({ ...entry })) } })
  if (unsupported !== undefined)
    return immutable({ categoryUnsupported: { category: unsupported } })
  const values: EffectiveValue[] = []
  for (const capability of [...(selected.has(key(root)) ? [root] : []), ...composition.values()]) {
    const current = selected.get(key(capability))
    if (current === undefined) throw new Error('composition is outside selected assets')
    const declared = declarationsFor(current.holding, facts).filter(
      entry => entry.item !== 'disabled' && !(same(capability, root) && entry.item === 'usableBy'),
    )
    const permissionHoldings = inEffect.filter(holding => same(holding.capability, capability))
    const ws = permissionHoldings.find(holding => holding.holder.layer === 'workspace')
    if (ws !== undefined)
      for (const assignment of ws.assignments) {
        const declaration =
          declared.find(entry => entry.item === assignment.item) ??
          (capability.category === 'mcp' ? mcpExecute(assignment.item) : undefined)
        if (declaration?.kind === 'permission')
          filtered.push({ capability, from: 'workspace', reason: 'workspace_permission' })
        else if (declaration?.category === 'placement_identity')
          filtered.push({ capability, from: 'workspace', reason: 'workspace_placement' })
        else if (declaration?.category === 'governance' && declaration.item !== 'disabled')
          filtered.push({ capability, from: 'workspace', reason: 'workspace_governance' })
      }
    for (const declaration of declared) {
      if (declaration.kind === 'setting') {
        const assigned: { layer: Layer; assignment: AttributeAssignment }[] = []
        for (const layer of ['organization', 'tenant', 'workspace'] as const) {
          const holding = surviving.find(
            entry =>
              inEffect.includes(entry) &&
              entry.holder.layer === layer &&
              same(entry.capability, capability) &&
              entry.asset === current.definition.id,
          )
          const assignment = holding?.assignments.find(entry => entry.item === declaration.item)
          if (
            assignment !== undefined &&
            !(
              layer === 'workspace' &&
              (declaration.category === 'placement_identity' ||
                declaration.category === 'governance')
            )
          )
            assigned.push({ layer, assignment })
        }
        const session = input.session?.find(
          entry => same(entry.capability, capability) && entry.assignment.item === declaration.item,
        )
        if (session !== undefined)
          assigned.push({ layer: 'session', assignment: session.assignment })
        const lock = assigned.find(entry => entry.assignment.immutable)
        const final = lock ?? assigned.at(-1)
        const value = final?.assignment.value ?? declaration.default
        if (value !== undefined)
          values.push({
            capability,
            item: declaration.item,
            value,
            from: final?.layer ?? 'factory',
            ...(lock === undefined ? {} : { lockedAt: lock.layer }),
            ...(declaration.category === 'placement_identity'
              ? { provenance: final?.layer ?? current.asset.from }
              : {}),
          })
      } else {
        const resolved =
          declaration.item === 'usableBy'
            ? usableValues.get(current.definition.id)
            : resolvePermission(
                declaration,
                assignmentsFor(
                  input,
                  capability,
                  declaration,
                  permissionHoldings,
                  definitions,
                  false,
                  facts,
                ),
                current.asset.from === 'workspace' ? strictPermission(declaration) : undefined,
              )
        if (resolved === undefined) throw new Error('selected asset has no usableBy value')
        const tieredExecute = tiersOf(declaration)?.includes('auto') === true
        values.push({
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
                  inEffect,
                ),
              }
            : {}),
        })
      }
    }
    // S23: an outer bound on a missing permission still creates its strict constrained value.
    const missing = new Map<
      string,
      { declarations: PermissionDeclaration[]; bounds: LayerPermissionAssignment[] }
    >()
    for (const holding of permissionHoldings) {
      if (
        (holding.holder.layer !== 'organization' && holding.holder.layer !== 'tenant') ||
        index(holding.holder.layer) >= index(current.asset.from)
      )
        continue
      const definition = definitions.get(holding.asset)
      if (definition === undefined) throw new Error('C5 invariant')
      const version = versionOf(holding, definition)
      if (version === undefined) continue
      for (const assignment of holding.assignments) {
        if (declared.some(entry => entry.item === assignment.item)) continue
        const declaration =
          declarationsFor(holding, facts).find(entry => entry.item === assignment.item) ??
          (capability.category === 'mcp' ? mcpExecute(assignment.item) : undefined)
        const value = permission(assignment.value)
        if (
          declaration?.kind !== 'permission' ||
          value === undefined ||
          classifyPermissionAssignment(declaration, { value, immutable: assignment.immutable })
            .role !== 'bound'
        )
          continue
        const entry = missing.get(assignment.item) ?? { declarations: [], bounds: [] }
        entry.declarations.push(declaration)
        entry.bounds.push({ layer: holding.holder.layer, value, immutable: assignment.immutable })
        missing.set(assignment.item, entry)
      }
    }
    for (const [item, entry] of missing) {
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
      values.push({
        capability,
        item,
        value: copyJson({ allowed }),
        from: entry.bounds.at(-1)?.layer ?? 'factory',
        lockedAt: entry.bounds[0]?.layer ?? 'factory',
        ...(tiersOf(first)?.includes('auto') === true ? { tenantAutoWritable: false } : {}),
      })
    }
  }
  const assets = [...selected.values()].map(entry => {
    if (
      !composition.has(key(entry.asset.capability)) ||
      (entry.asset.capability.category !== 'skill' && entry.asset.capability.category !== 'tool')
    )
      return entry.asset
    return {
      ...entry.asset,
      resident:
        input.root.references.find(reference => same(reference.capability, entry.asset.capability))
          ?.resident ?? false,
    }
  })
  const unique = <T>(list: readonly T[]): T[] => [
    ...new Map(list.map(entry => [canonical(copyJson(entry)), entry])).values(),
  ]
  const ordered = <T>(list: readonly T[], capabilityOf: (entry: T) => CapabilityId): T[] =>
    unique(list).sort(
      (a, b) =>
        codePointCompare(key(capabilityOf(a)), key(capabilityOf(b))) ||
        codePointCompare(canonical(copyJson(a)), canonical(copyJson(b))),
    )
  const assembly: EffectiveAssembly = {
    root: { ...root },
    assets: ordered(assets, entry => entry.capability),
    composition: ordered(
      [...composition.values()].map(entry => ({ ...entry })),
      entry => entry,
    ),
    values: ordered(values, entry => entry.capability),
    filteredOut: ordered(filtered, entry => entry.capability),
    unresolved: ordered(unresolved, entry => entry.capability),
  }
  // Copy every nested value before freezing: input ownership stays with the caller.
  return immutable({ ok: cloneAssembly(assembly) })
}
function tenantWritable(
  input: NonConnectorEvaluationInput,
  capability: CapabilityId,
  selected: Selected,
  declaration: PermissionDeclaration,
  inEffect: readonly AssetHolding[],
): boolean {
  if (capability.category !== 'tool' || selected.asset.from === 'workspace') return false
  const organization = input.holdings.find(
    holding => holding.holder.layer === 'organization' && same(holding.capability, capability),
  )
  const assignment = organization?.assignments.find(entry => entry.item === declaration.item)
  if (assignment !== undefined) {
    const value = permission(assignment.value)
    if (
      value !== undefined &&
      classifyPermissionAssignment(declaration, { value, immutable: assignment.immutable }).role ===
        'bound' &&
      !value.allowed.includes('auto')
    )
      return false
  }
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
