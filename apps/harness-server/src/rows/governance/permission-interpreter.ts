import { canonicalText } from '@omne-harness/authorization'
import { EnforcementBindingSchema } from '@omne-harness/governance-contract'
import {
  evaluatePermission,
  PermissionBasisRequestSchema,
  PermissionCurrentBasisSchema,
  type PermissionEvaluationResult,
  type PermissionEvaluation,
} from '@omne-harness/permissions'
import { z } from 'zod'
import {
  resolvePermissionInterpretation,
  type UnsupportedInterpretation,
  type PermissionInterpretation,
} from './permission-interpretation.ts'

export const permissionActionSchema = z.strictObject({
  binding: EnforcementBindingSchema,
  request: PermissionBasisRequestSchema,
})
export type PermissionAction = z.infer<typeof permissionActionSchema>
export type PermissionDecision =
  | UnsupportedInterpretation
  | Readonly<{
      kind: 'allow' | 'deny' | 'need-decision'
      action: PermissionAction
      evaluation: Exclude<PermissionEvaluationResult, { kind: 'invalid-input' | 'unavailable' }>
    }>

function actionMatches(action: PermissionAction): boolean {
  return (
    action.binding.implementationRef === action.request.implementationRef &&
    action.binding.capabilityId === action.request.capabilityId &&
    action.binding.enforcementKey === action.request.enforcementKey
  )
}

/** Interprets owner-qualified transaction facts. It does not qualify callers or issue future permits. */
export function interpretPermission(input: {
  released: unknown
  action: unknown
  current: unknown
}): PermissionDecision {
  const action = permissionActionSchema.safeParse(input.action)
  const current = PermissionCurrentBasisSchema.safeParse(input.current)
  if (!action.success || !current.success) return { kind: 'unavailable', reason: 'material' }
  if (
    !actionMatches(action.data) ||
    canonicalText(action.data.request) !== canonicalText(current.data.request)
  )
    return { kind: 'unavailable', reason: 'binding' }
  const support = resolvePermissionInterpretation(input.released, action.data.binding)
  if (support.kind === 'unavailable') return support
  const { definition } = support.interpretation
  const material = current.data.evaluation
  if (
    canonicalText(definition.reference) !== canonicalText(action.data.request.definition) ||
    (material.declaration.kind === 'available' &&
      canonicalText(definition) !== canonicalText(material.declaration.definition))
  )
    return { kind: 'unavailable', reason: 'binding' }
  return evaluateInterpretation({
    action: action.data,
    interpretation: support.interpretation,
    material,
  })
}

function evaluateInterpretation(input: {
  action: PermissionAction
  interpretation: PermissionInterpretation
  material: PermissionEvaluation
}): PermissionDecision {
  const evaluation = evaluatePermission(input.material)
  if (evaluation.kind === 'invalid-input' || evaluation.kind === 'unavailable')
    return { kind: 'unavailable', reason: 'material' }
  if (evaluation.kind === 'denied' || !evaluation.permitsOperation)
    return { kind: 'deny', action: input.action, evaluation }
  const effect = input.interpretation.effects.find(
    entry => entry.value === evaluation.value,
  )?.effect
  return effect === undefined
    ? { kind: 'unavailable', reason: 'interpretation' }
    : { kind: effect, action: input.action, evaluation }
}
