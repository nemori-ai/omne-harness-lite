import { canonicalText } from '@omne-harness/authorization'
import {
  EnforcementBindingSchema,
  type EnforcementBinding,
} from '@omne-harness/governance-contract'
import { definePermission, PermissionDefinitionSchema } from '@omne-harness/permissions'
import { z } from 'zod'

export const PERMISSION_INTERPRETATION = 'harness.permission-rule/1'
export const permissionInterpretationSchema = z.strictObject({
  binding: EnforcementBindingSchema,
  definition: PermissionDefinitionSchema,
  effects: z
    .array(
      z.strictObject({
        value: PermissionDefinitionSchema.shape.values.element.shape.id,
        effect: z.enum(['allow', 'deny', 'need-decision']),
      }),
    )
    .min(1)
    .max(64),
})
export type PermissionInterpretation = z.infer<typeof permissionInterpretationSchema>
export type UnsupportedInterpretation = Readonly<{
  kind: 'unavailable'
  reason: 'interpretation' | 'binding' | 'material'
}>

function completeMapping(released: PermissionInterpretation): boolean {
  const effects = new Map(released.effects.map(entry => [entry.value, entry.effect]))
  return (
    effects.size === released.effects.length &&
    effects.size === released.definition.values.length &&
    released.definition.values.every(value => {
      const effect = effects.get(value.id)
      return effect !== undefined && (value.permitsOperation || effect === 'deny')
    })
  )
}

/** The release owner supplies this material; validation alone does not establish its provenance. */
export function resolvePermissionInterpretation(
  released: unknown,
  expected: EnforcementBinding,
): { kind: 'supported'; interpretation: PermissionInterpretation } | UnsupportedInterpretation {
  const parsed = permissionInterpretationSchema.safeParse(released)
  if (!parsed.success) return { kind: 'unavailable', reason: 'material' }
  const interpretation = parsed.data
  if (interpretation.binding.interpretationRef !== PERMISSION_INTERPRETATION)
    return { kind: 'unavailable', reason: 'interpretation' }
  if (
    canonicalText(interpretation.binding) !== canonicalText(expected) ||
    interpretation.definition.capabilityId !== expected.capabilityId ||
    interpretation.definition.enforcementKey !== expected.enforcementKey
  )
    return { kind: 'unavailable', reason: 'binding' }
  if (
    definePermission(interpretation.definition).kind !== 'defined' ||
    !completeMapping(interpretation)
  )
    return { kind: 'unavailable', reason: 'material' }
  return { kind: 'supported', interpretation }
}
