import type { CapabilityId, JsonValue } from '@omne-harness/assets'
import type { SettingDeclaration, SkillDefinition } from './values.ts'

const text = (value: string): JsonValue => ({ kind: 'string', value })
const list = (items: readonly JsonValue[]): JsonValue => ({ kind: 'array', items })
const object = (entries: readonly (readonly [string, JsonValue])[]): JsonValue => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})

function tool(id: CapabilityId): JsonValue {
  return object([
    ['category', text(id.category)],
    ['name', text(id.name)],
  ])
}

function setting(declaration: SettingDeclaration): JsonValue {
  return object([
    ['name', text(declaration.name)],
    ['category', text(declaration.category)],
  ])
}

export function projectAssetBody(definition: SkillDefinition): JsonValue {
  const { manifest, declaration, snapshot } = definition
  return object([
    ['name', text(manifest.name)],
    ['description', text(manifest.description)],
    ['tools', list(declaration.dependencies.map(tool))],
    ['settings', list(declaration.settings.map(setting))],
    ['package', object([['digest', text(snapshot.digest)]])],
  ])
}
