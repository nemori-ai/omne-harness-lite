import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { SettingDefinitionsSchema, type SettingsChange } from '@omne-harness/settings'

export const definition = SettingDefinitionsSchema.parse({
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
  groups: [
    {
      id: 'general',
      parentId: null,
      title: 'General',
      description: 'Common preferences',
      order: 0,
    },
  ],
  items: [
    {
      id: 'enabled',
      groupId: 'general',
      category: 'preference',
      presentation: {
        title: 'Show tips',
        description: 'Display help during use',
        impact: 'Used on the next read',
        clear: 'Use the outer value',
        adoption: 'next-read',
      },
      valueSchema: { type: 'boolean' },
      default: { kind: 'value', value: false },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})
export const definitionRef = {
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
  digest: createHash('sha256').update(canonicalize(definition)!).digest('hex'),
}
export const secretDefinition = SettingDefinitionsSchema.parse({
  ...definition,
  items: definition.items.map(item => ({
    ...item,
    sensitivity: 'secret',
    default: { kind: 'absent' },
    valueSchema: { type: 'string' },
  })),
})
export const secretDefinitionRef = {
  ...definitionRef,
  digest: createHash('sha256').update(canonicalize(secretDefinition)!).digest('hex'),
}
export function command(overrides: Partial<SettingsChange> = {}): SettingsChange {
  return {
    protocol: 'settings/1',
    requestId: 'request-1',
    operationId: 'operation-1',
    target: { policyId: 'independent', targetRef: 'preferences', scopeRef: 'tenant-a' },
    definitionRef,
    expectedRevision: 0,
    sourceId: 'tenant',
    itemId: 'enabled',
    action: { kind: 'set', value: true },
    ...overrides,
  }
}
