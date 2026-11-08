import { z } from 'zod'
import {
  PermissionDefinitionSchema,
  PermissionEvaluationSchema,
  PermissionRuleSchema,
  type PermissionDefinition,
  type PermissionEvaluation,
  type PermissionInputFailure,
  type PermissionRule,
} from './schema.ts'
import { validRule } from './definition.ts'
import { permissionBounds, type PermissionBounds } from './evaluation.ts'

const layers = ['organization', 'tenant', 'session'] as const
const requestSchema = z.strictObject({
  layer: PermissionDefinitionSchema.shape.assignmentLayers.element,
  rule: PermissionRuleSchema.nullable(),
  current: z.unknown().optional(),
})
type Layer = z.infer<typeof requestSchema>['layer']
export type PermissionAssignmentJudgment =
  | PermissionInputFailure
  | { kind: 'valid'; basis: 'clear' | 'restrictive' | 'current-bounds' }
  | { kind: 'denied'; reason: 'active-prohibition' | 'empty-bound' | 'outside-bound' }
  | { kind: 'unavailable'; missingBasis: string[] }

function outerMaterial(material: PermissionEvaluation, layer: Layer): PermissionEvaluation {
  const index = layers.indexOf(layer)
  const sources = { ...material.sources }
  for (const candidate of layers.slice(index))
    sources[candidate] = { kind: 'absent', revision: 'replaced-by-this-write' }
  return { ...material, sources }
}

function scoped(material: PermissionEvaluation, layer: Layer): boolean {
  if (layer === 'organization') return material.scope.organizationId !== null
  if (layer === 'session') return material.scope.sessionId !== null
  return true
}

function restrictive(rule: PermissionRule, definition: PermissionDefinition): boolean {
  const denied = new Set(
    definition.values.filter(value => !value.permitsOperation).map(value => value.id),
  )
  return (
    (rule.pick !== null && denied.has(rule.pick)) ||
    (rule.allowedSet !== null && rule.allowedSet.every(value => denied.has(value)))
  )
}

function judgeBound(rule: PermissionRule, bounds: PermissionBounds): PermissionAssignmentJudgment {
  if (bounds.prohibited) return { kind: 'denied', reason: 'active-prohibition' }
  if (bounds.allowedSet?.length === 0) return { kind: 'denied', reason: 'empty-bound' }
  if (bounds.missingBasis.length > 0)
    return { kind: 'unavailable', missingBasis: bounds.missingBasis }
  if (bounds.allowedSet === undefined) return { kind: 'unavailable', missingBasis: ['declaration'] }
  const allowedSet = bounds.allowedSet
  const proposed = [...(rule.pick === null ? [] : [rule.pick]), ...(rule.allowedSet ?? [])]
  const declaration = bounds.material.declaration
  if (declaration.kind !== 'available')
    return { kind: 'unavailable', missingBasis: ['declaration'] }
  const permits = new Set(
    declaration.definition.values.filter(value => value.permitsOperation).map(value => value.id),
  )
  return proposed.every(value => !permits.has(value) || allowedSet.includes(value))
    ? { kind: 'valid', basis: 'current-bounds' }
    : { kind: 'denied', reason: 'outside-bound' }
}

/** Checks assignment semantics only. The writer still owns authority, row binding and atomicity. */
export function judgePermissionAssignment(input: unknown): PermissionAssignmentJudgment {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return { kind: 'invalid-input', reason: 'structure' }
  const { layer, rule } = parsed.data
  if (rule === null) return { kind: 'valid', basis: 'clear' }
  const current = PermissionEvaluationSchema.safeParse(parsed.data.current)
  if (!current.success) return { kind: 'invalid-input', reason: 'structure' }
  if (!scoped(current.data, layer)) return { kind: 'invalid-input', reason: 'binding' }
  const bounds = permissionBounds(outerMaterial(current.data, layer))
  if (bounds.kind === 'invalid-input') return bounds
  const declaration = bounds.material.declaration
  if (declaration.kind !== 'available')
    return { kind: 'unavailable', missingBasis: ['declaration'] }
  const definition = declaration.definition
  if (
    !definition.assignmentLayers.includes(layer) ||
    !validRule(
      rule,
      definition.values.map(value => value.id),
    )
  )
    return { kind: 'invalid-input', reason: 'rule' }
  return restrictive(rule, definition)
    ? { kind: 'valid', basis: 'restrictive' }
    : judgeBound(rule, bounds)
}
