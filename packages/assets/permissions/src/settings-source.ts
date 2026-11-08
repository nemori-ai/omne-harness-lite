import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import { permissionSettingsDefinition } from './settings.ts'
import { unique, validRule, validDefinition } from './definition.ts'
import {
  SettingDefinitionsSchema,
  type SettingDefinitions,
  SettingSourceSchema,
  SettingsSourceDescriptorSchema,
} from '@omne-harness/settings'
import {
  PermissionDefinitionSchema,
  PermissionScopeSchema,
  PermissionSourceSchema,
  PermissionRuleSchema,
  type PermissionInputFailure,
  type PermissionSource,
} from './schema.ts'

export const PermissionSettingsSourceSchema = z.strictObject({
  definition: PermissionDefinitionSchema,
  scope: PermissionScopeSchema,
  layer: z.enum(['organization', 'tenant', 'session']),
  sourceRef: PermissionSourceSchema.options[2].shape.sourceRef,
  revision: PermissionSourceSchema.options[2].shape.revision,
  observation: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('unavailable') }),
    z.strictObject({
      kind: z.literal('available'),
      definition: SettingDefinitionsSchema,
      descriptor: SettingsSourceDescriptorSchema,
      source: SettingSourceSchema,
    }),
  ]),
})
export type PermissionSettingsSource = z.infer<typeof PermissionSettingsSourceSchema>
type Available = Extract<PermissionSettingsSource['observation'], { kind: 'available' }>
const invalid = (reason: PermissionInputFailure['reason']): PermissionInputFailure => ({
  kind: 'invalid-input',
  reason,
})

function mappedDefinition(observation: Available, expected: SettingDefinitions) {
  const actual = observation.definition
  const item = expected.items[0]!
  return (
    actual.providerId === expected.providerId &&
    actual.definitionId === expected.definitionId &&
    actual.version === expected.version &&
    unique(actual.items.map(entry => entry.id)) &&
    unique(actual.groups.map(entry => entry.id)) &&
    isDeepStrictEqual(
      actual.items.find(entry => entry.id === item.id),
      item,
    ) &&
    isDeepStrictEqual(
      actual.groups.find(entry => entry.id === item.groupId),
      expected.groups[0],
    )
  )
}

function sourceMatches(input: PermissionSettingsSource, observation: Available) {
  const { descriptor, source } = observation
  const subject = input.scope[`${input.layer}Id`]
  return (
    subject !== null &&
    descriptor.scope.kind === input.layer &&
    descriptor.scope.subjectRef === subject &&
    descriptor.sourceId === source.id
  )
}

function observedSource(
  input: PermissionSettingsSource,
  observation: Available,
  expected: SettingDefinitions,
): PermissionSource | PermissionInputFailure {
  if (!mappedDefinition(observation, expected)) return invalid('definition')
  if (!sourceMatches(input, observation)) return invalid('binding')
  const assignments = observation.source.values
  if (!unique(assignments.map(item => item.itemId))) return invalid('rule')
  const assignment = assignments.find(item => item.itemId === expected.items[0]!.id)
  if (assignment === undefined || assignment.value.kind === 'absent')
    return { kind: 'absent', revision: input.revision }
  if (!input.definition.assignmentLayers.includes(input.layer)) return invalid('rule')
  const rule = PermissionRuleSchema.safeParse(assignment.value.value)
  if (
    !rule.success ||
    !validRule(
      rule.data,
      input.definition.values.map(value => value.id),
    )
  )
    return invalid('rule')
  return {
    kind: 'available',
    sourceRef: input.sourceRef,
    revision: input.revision,
    scope: input.scope,
    definition: input.definition.reference,
    rule: rule.data,
  }
}

export function readPermissionSettingsSource(
  raw: unknown,
): PermissionSource | PermissionInputFailure {
  const parsed = PermissionSettingsSourceSchema.safeParse(raw)
  if (!parsed.success) return invalid('structure')
  const input = parsed.data
  if (!validDefinition(input.definition)) return invalid('definition')
  const expected = permissionSettingsDefinition(input.definition)
  if (expected === undefined) return invalid('definition')
  return input.observation.kind === 'unavailable'
    ? { kind: 'unavailable', sourceRef: input.sourceRef }
    : observedSource(input, input.observation, expected)
}
