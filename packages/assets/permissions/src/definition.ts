import {
  PermissionDefinitionSchema,
  PermissionUpperBoundsSchema,
  type PermissionUpperBound,
  type PermissionDefinition,
  type PermissionRule,
  type PermissionInputFailure,
} from './schema.ts'

function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child)
    Object.freeze(value)
  }
  return value
}

export function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}
export function validRule(rule: PermissionRule, values: readonly string[]): boolean {
  return (
    (rule.pick === null || values.includes(rule.pick)) &&
    (rule.allowedSet === null ||
      (unique(rule.allowedSet) && rule.allowedSet.every(value => values.includes(value))))
  )
}
function validComparison(definition: PermissionDefinition): boolean {
  const comparison = definition.comparison
  if (comparison === null) return true
  const ids = definition.values.map(value => value.id)
  if (
    !unique(comparison.strictOrder) ||
    comparison.strictOrder.length !== ids.length ||
    !ids.every(id => comparison.strictOrder.includes(id))
  )
    return false
  const matrix = comparison.distances
  return (
    matrix.length === ids.length &&
    matrix.every(
      (row, i) =>
        row.length === ids.length &&
        row.every(
          (distance, j) => (i === j ? distance === 0 : distance > 0) && distance === matrix[j]?.[i],
        ),
    )
  )
}
export function validDefinition(definition: PermissionDefinition): boolean {
  const ids = definition.values.map(value => value.id)
  return (
    unique(ids) &&
    unique(definition.assignmentLayers) &&
    unique(definition.supportedScopes.map(scope => scope.kind)) &&
    validRule(definition.defaultRule, ids) &&
    validComparison(definition)
  )
}
export type PermissionDefinitionResult =
  | { kind: 'defined'; definition: PermissionDefinition }
  | PermissionInputFailure
export function definePermission(input: unknown): PermissionDefinitionResult {
  const parsed = PermissionDefinitionSchema.safeParse(input)
  if (!parsed.success) return { kind: 'invalid-input', reason: 'structure' }
  if (!validDefinition(parsed.data)) return { kind: 'invalid-input', reason: 'definition' }
  return { kind: 'defined', definition: immutable(parsed.data) }
}

export type PermissionUpperBoundsResult =
  | { kind: 'defined'; bounds: readonly PermissionUpperBound[] }
  | PermissionInputFailure

export function definePermissionUpperBounds(input: unknown): PermissionUpperBoundsResult {
  const parsed = PermissionUpperBoundsSchema.safeParse(input)
  if (!parsed.success) return { kind: 'invalid-input', reason: 'structure' }
  const keys = parsed.data.map(bound => JSON.stringify([bound.capabilityId, bound.enforcementKey]))
  if (!unique(keys) || parsed.data.some(bound => !unique(bound.allowedSet)))
    return { kind: 'invalid-input', reason: 'definition' }
  return { kind: 'defined', bounds: immutable(parsed.data) }
}
