import {
  capabilityCanonicalString,
  USABLE_BY_DECLARATION,
  type AssetDefinition,
  type AssetHolding,
  type AssetVersion,
  type AttributeDeclaration,
  type CapabilityId,
  type PermissionValue,
} from '@omne-harness-lite/asset-model'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { object } from './json.ts'
import type { LayerPermissionAssignment } from './permissions.ts'
import type {
  EffectiveAsset,
  HoldingLayer,
  Layer,
  NonConnectorEvaluationInput,
  PermissionDeclaration,
  SessionAssignment,
} from './types.ts'

/** Internal projection values, keyed by the admitted holding and selected body version. Not a domain object or provider port. */
export interface EvaluationFacts {
  readonly declarations: ReadonlyMap<AssetHolding, readonly AttributeDeclaration[]>
  readonly references: ReadonlyMap<AssetVersion, readonly CapabilityId[]>
}

export const usableBy: PermissionDeclaration = (() => {
  if (USABLE_BY_DECLARATION.kind !== 'permission')
    throw new Error('reserved usableBy declaration must be a permission')
  return USABLE_BY_DECLARATION
})()
export const layers: readonly HoldingLayer[] = ['factory', 'organization', 'tenant', 'workspace']
export const index = (layer: Layer): number => (layer === 'session' ? 4 : layers.indexOf(layer))
export const key = capabilityCanonicalString
export const same = (a: CapabilityId, b: CapabilityId): boolean => key(a) === key(b)
/** Asset ownership order: outer layers first. */
export const byLayer = (left: AssetHolding, right: AssetHolding): number =>
  index(left.holder.layer) - index(right.holder.layer)

/** One capability's selected holding, definition and version, with the EffectiveAsset they yield (S-18). */
export interface Selected {
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
/** The definition a holding points to; C5 admitted it before any caller gets here. */
export function heldDefinition(
  definitions: ReadonlyMap<string, AssetDefinition>,
  holding: AssetHolding,
): AssetDefinition {
  const definition = definitions.get(holding.asset)
  if (definition === undefined) throw new Error('C5 invariant')
  return definition
}
export function permission(value: unknown): PermissionValue | undefined {
  if (
    !object(value) ||
    !Array.isArray(value.allowed) ||
    value.allowed.some(token => typeof token !== 'string')
  )
    return undefined
  // This local representation is only a projection after checking every token.
  return { allowed: value.allowed.filter((token): token is string => typeof token === 'string') }
}
export function mcpExecute(item: string): PermissionDeclaration | undefined {
  return item.startsWith('execute:')
    ? {
        item,
        kind: 'permission',
        domain: { kind: 'enum', values: ['forbid', 'auto', 'ask'] },
        default: 'ask',
      }
    : undefined
}
export function declarationsFor(
  holding: AssetHolding,
  facts: EvaluationFacts,
): readonly AttributeDeclaration[] {
  return facts.declarations.get(holding) ?? [USABLE_BY_DECLARATION]
}
/** Which declaration a layer's permission assignment is read against: the reserved usableBy, an mcp per-action item, or the held version's own declaration. */
function sourceDeclarationFor(
  holding: AssetHolding,
  capability: CapabilityId,
  declaration: PermissionDeclaration,
  version: AssetVersion | undefined,
  specialUsable: boolean,
  facts: EvaluationFacts,
): AttributeDeclaration | undefined {
  if (specialUsable) return USABLE_BY_DECLARATION
  const held =
    version === undefined
      ? undefined
      : declarationsFor(holding, facts).find(entry => entry.item === declaration.item)
  return capability.category === 'mcp' ? (mcpExecute(declaration.item) ?? held) : held
}
function sessionPermissionAssignment(
  session: readonly SessionAssignment[] | undefined,
  capability: CapabilityId,
  declaration: PermissionDeclaration,
): LayerPermissionAssignment | undefined {
  const entry = session?.find(
    entry => same(entry.capability, capability) && entry.assignment.item === declaration.item,
  )
  if (entry === undefined) return undefined
  const value = permission(entry.assignment.value)
  return value === undefined
    ? undefined
    : { layer: 'session', value, immutable: entry.assignment.immutable }
}
/** S-23: the permission assignments for `declaration.item` on `capability` along the permission order. */
export function assignmentsFor(
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
    const source = sourceDeclarationFor(
      holding,
      capability,
      declaration,
      versionOf(holding, definition),
      specialUsable,
      facts,
    )
    if (source?.kind !== 'permission') continue
    const value = permission(assignment.value)
    if (value === undefined) continue
    result.push({ layer, value, immutable: assignment.immutable })
  }
  const session = sessionPermissionAssignment(input.session, capability, declaration)
  if (session !== undefined) result.push(session)
  return result
}
