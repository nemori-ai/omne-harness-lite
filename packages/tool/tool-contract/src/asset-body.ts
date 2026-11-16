import { readBodyText, type JsonValue } from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import type { ToolDeclarations } from './authoring.ts'
import type { ToolDefinition } from './definitions.ts'

const LIMITS = {
  maxBytes: 1_048_576,
  maxDepth: 64,
  maxItems: 4096,
  maxMembers: 1024,
  maxStringLength: 65_536,
  maxNumberLength: 64,
}

export function toolAssetBody(
  definition: Pick<ToolDefinition, 'name' | 'programmable' | 'requiredCapabilities'> &
    Readonly<{ declarations: Pick<ToolDeclarations, 'settings'> }>,
): JsonValue {
  const members = [
    `"name":${JSON.stringify(definition.name)}`,
    `"requiredCapabilities":${JSON.stringify(definition.requiredCapabilities)}`,
  ]
  if (definition.programmable !== undefined)
    members.push(`"programmable":${JSON.stringify(definition.programmable)}`)
  const settings = definition.declarations.settings
  if (settings !== null) {
    const items = settings.items.map(item => ({
      path: item.path,
      category: item.category,
      sensitive: item.sensitive,
      presentation: item.presentation,
    }))
    members.push(
      `"settings":{"schema":${writeJsonText(settings.schema.schema)},"defaults":${writeJsonText(settings.defaults)},"items":${JSON.stringify(items)}}`,
    )
  }
  const read = readBodyText(`{${members.join(',')}}`, LIMITS)
  if (read.kind !== 'ok')
    throw new TypeError(`tool ${definition.name}: the asset body is too large`)
  return read.value
}
