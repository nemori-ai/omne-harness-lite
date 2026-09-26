import type { AttributeDeclaration } from '@omne-harness-lite/asset-model'
import type { CapabilityId } from '@omne-harness-lite/content-blocks'
import type { ToolDefinition } from './types.ts'

const id =
  'https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v1/tool-definition.schema.json'
export function toolAttributeDeclarations(
  definition: ToolDefinition,
): readonly AttributeDeclaration[] {
  if (definition.origin.kind === 'mcp') return Object.freeze([])
  const declarations: AttributeDeclaration[] = []
  const settings = definition.settings
  if (settings?.targetEnvironment !== undefined)
    declarations.push({
      item: 'targetEnvironment',
      kind: 'setting',
      category: 'placement_identity',
      domain: Object.freeze({
        kind: 'open',
        schema: Object.freeze({ $ref: `${id}#/$defs/TargetEnvironment` }),
      }),
      default: Object.freeze({
        bindingLayer: settings.targetEnvironment.default.bindingLayer,
        facilities: Object.freeze([...settings.targetEnvironment.default.facilities]),
      }),
    })
  for (const item of ['backgroundThreshold', 'timeout'] as const) {
    const declaration = settings?.[item]
    if (declaration !== undefined)
      declarations.push({
        item,
        kind: 'setting',
        category: 'preference',
        domain: Object.freeze({
          kind: 'open',
          schema: Object.freeze({ $ref: `${id}#/$defs/Duration` }),
        }),
        default: declaration.default,
      })
  }
  if (settings?.concurrency !== undefined)
    declarations.push({
      item: 'concurrency',
      kind: 'setting',
      category: 'preference',
      domain: Object.freeze({
        kind: 'open',
        schema: Object.freeze({ type: 'integer', minimum: 1 }),
      }),
      default: settings.concurrency.default,
    })
  declarations.push({
    item: 'execute',
    kind: 'permission',
    domain: Object.freeze({ kind: 'enum', values: Object.freeze(['forbid', 'auto', 'ask']) }),
    default: definition.permissions.execute.default,
  })
  return Object.freeze(declarations.map(value => Object.freeze(value)))
}
export function toolReferences(definition: ToolDefinition): readonly CapabilityId[] {
  if (definition.origin.kind === 'mcp') return Object.freeze([])
  return Object.freeze(
    (definition.composes?.skills ?? []).map(name =>
      Object.freeze({ category: 'skill' as const, name }),
    ),
  )
}
