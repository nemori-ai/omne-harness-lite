import {
  type AssetDefinition,
  type AssetHolding,
  type AttributeAssignment,
} from '@omne-harness-lite/asset-model'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { diagnostic, invalidInput } from './diagnostics.ts'
import {
  assignmentsFor,
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
import { resolvePermission, strictPermission } from './permissions.ts'
import type { EvaluationRootSelectionInput, FilteredOut } from './types.ts'

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
