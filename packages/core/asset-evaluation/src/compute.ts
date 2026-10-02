import {
  type AssetHolding,
  type AttributeAssignment,
  type AttributeDeclaration,
  type CapabilityId,
} from '@omne-harness-lite/asset-model'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeAgentDefinitionBody } from '@omne-harness-lite/agent-definition'
import { assetJudge } from './defaults.ts'
import { diagnostic, invalidInput } from './diagnostics.ts'
import {
  assignmentsFor,
  declarationsFor,
  index,
  key,
  mcpExecute,
  permission,
  same,
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
import { selectAssets } from './selection.ts'
import type {
  EffectiveAssembly,
  EffectiveValue,
  EvaluationResult,
  Layer,
  NonConnectorEvaluationInput,
  PermissionDeclaration,
  Unresolved,
} from './types.ts'

export type { EvaluationFacts }

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
