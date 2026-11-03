// Projects a Skill definition into the asset body that the `skill` category port judges.
import type { CapabilityId, JsonValue } from '@omne-harness/assets'
import type { ScriptDeclaration, SettingDeclaration, SkillDefinition } from './values.ts'

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

function script(declaration: ScriptDeclaration): JsonValue {
  const fields: [string, JsonValue][] = [
    ['entry', text(declaration.entry)],
    ['runKind', text(declaration.runKind)],
    ['facilities', list(declaration.facilities.map(text))],
  ]
  if (declaration.parameters !== undefined) fields.push(['parameters', declaration.parameters])
  return object(fields)
}

function setting(declaration: SettingDeclaration): JsonValue {
  return object([
    ['name', text(declaration.name)],
    ['category', text(declaration.category)],
  ])
}

/**
 * The asset body `{ name, description, tools, scripts, settings, package: { digest } }` as a JSON
 * tree. Write it with `writeJsonText` and read it back with `readBodyText` before judging it.
 */
export function projectAssetBody(definition: SkillDefinition): JsonValue {
  const { manifest, declaration, snapshot } = definition
  return object([
    ['name', text(manifest.name)],
    ['description', text(manifest.description)],
    ['tools', list(declaration.dependencies.map(tool))],
    ['scripts', list(declaration.scripts.map(script))],
    ['settings', list(declaration.settings.map(setting))],
    ['package', object([['digest', text(snapshot.digest)]])],
  ])
}
