import { defineSettings, type SettingDefinitions } from '@omne-harness/settings'
import { definePermission } from './definition.ts'
import type { PermissionDefinition, PermissionInputFailure } from './schema.ts'

export type PermissionSettingsProjection =
  | { kind: 'projected'; definition: SettingDefinitions; permission: PermissionDefinition }
  | { kind: 'not-configurable' }
  | PermissionInputFailure

export function permissionSettingsDefinition(
  permission: PermissionDefinition,
): SettingDefinitions | undefined {
  const mapping = permission.settings
  if (mapping === null) return undefined
  const ids = permission.values.map(value => value.id)
  return {
    providerId: mapping.providerId,
    definitionId: mapping.definitionId,
    version: mapping.version,
    groups: [
      {
        id: mapping.groupId,
        parentId: null,
        title: mapping.groupTitle,
        description: mapping.groupDescription,
        order: 0,
      },
    ],
    items: [
      {
        id: mapping.itemId,
        groupId: mapping.groupId,
        category: 'governance',
        presentation: {
          title: permission.title,
          description: permission.description,
          impact: permission.approvalEffect,
          clear: '清除本层挑选与锁界，重新按当前来源求值。',
          adoption: 'next-boundary',
          enumLabels: permission.values.map(value => ({
            value: value.id,
            title: value.title,
            description: value.description,
          })),
        },
        valueSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['pick', 'allowedSet'],
          properties: {
            pick: { anyOf: [{ type: 'null' }, { type: 'string', enum: ids }] },
            allowedSet: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'array',
                  items: { type: 'string', enum: ids },
                  uniqueItems: true,
                  maxItems: ids.length,
                },
              ],
            },
          },
        },
        default: { kind: 'value', value: permission.defaultRule },
        merge: 'override',
        sensitivity: 'ordinary',
      },
    ],
  }
}

export function projectPermissionSettings(input: unknown): PermissionSettingsProjection {
  const declared = definePermission(input)
  if (declared.kind !== 'defined') return declared
  const permission = declared.definition
  const definition = permissionSettingsDefinition(permission)
  if (definition === undefined) return { kind: 'not-configurable' }
  const result = defineSettings(definition)
  if (result.kind !== 'defined') return { kind: 'invalid-input', reason: 'definition' }
  return { kind: 'projected', definition: result.definition, permission }
}
