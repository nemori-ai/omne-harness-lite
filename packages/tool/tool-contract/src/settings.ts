import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { SettingDefinitions, SettingItem } from '@omne-harness/settings'
import type { ToolSettingPresentation, ToolSettingsDeclaration } from './authoring.ts'

export type BodySettings = Readonly<{
  schema: JsonValue
  defaults: JsonValue
  items: ToolSettingsDeclaration['items']
}>

const TOOL_SETTINGS_PROVIDER = 'tool'

const TOOL_SETTINGS_GROUP = 'tool'

const UNPINNED_VERSION = '0'

const CATEGORIES: ReadonlySet<string> = new Set([
  'preference',
  'binding',
  'placement-identity',
  'governance',
])

const ID_LITERAL = /^[a-zA-Z0-9.:/-]$/u

function settingsIdText(text: string): string {
  let out = ''
  for (const character of text)
    out += ID_LITERAL.test(character) ? character : `_${character.codePointAt(0)!.toString(16)}_`
  return out
}

type Json = Extract<SettingItem['default'], { kind: 'value' }>['value']

function plain(tree: JsonValue): Json {
  return JSON.parse(writeJsonText(tree)) as Json
}

function memberOf(tree: JsonValue | undefined, key: string): JsonValue | undefined {
  if (tree === undefined || tree.kind !== 'object') return undefined
  return tree.entries.find(entry => entry.key === key)?.value
}

export function bodySettings(body: JsonValue): BodySettings | null | 'invalid' {
  const settings = memberOf(body, 'settings')
  if (settings === undefined) return null
  const schema = memberOf(settings, 'schema')
  const defaults = memberOf(settings, 'defaults')
  const items = memberOf(settings, 'items')
  if (schema?.kind !== 'object' || defaults === undefined || items?.kind !== 'array')
    return 'invalid'
  const read: ToolSettingsDeclaration['items'][number][] = []
  for (const item of items.items) {
    const path = memberOf(item, 'path')
    const category = memberOf(item, 'category')
    const sensitive = memberOf(item, 'sensitive')
    const presentation = memberOf(item, 'presentation')
    if (path?.kind !== 'array' || path.items.length === 0) return 'invalid'
    const segments: string[] = []
    for (const segment of path.items) {
      if (segment.kind !== 'string' || segment.value === '') return 'invalid'
      segments.push(segment.value)
    }
    if (category?.kind !== 'string' || !CATEGORIES.has(category.value)) return 'invalid'
    if (sensitive?.kind !== 'boolean' || presentation?.kind !== 'object') return 'invalid'
    read.push({
      path: segments,
      category: category.value as ToolSettingsDeclaration['items'][number]['category'],
      sensitive: sensitive.value,
      presentation: plain(presentation) as ToolSettingPresentation,
    })
  }
  return { schema, defaults, items: read }
}

function schemaAt(
  schema: JsonValue,
  path: readonly string[],
  id: string,
): SettingItem['valueSchema'] {
  let node: JsonValue | undefined = schema
  for (const segment of path) node = memberOf(memberOf(node, 'properties'), segment)
  if (node === undefined || node.kind !== 'object')
    throw new TypeError(`tool settings: the schema describes no object at the item ${id}`)
  return plain(node) as SettingItem['valueSchema']
}

function defaultAt(defaults: JsonValue, path: readonly string[]): SettingItem['default'] {
  let node: JsonValue | undefined = defaults
  for (const segment of path) node = memberOf(node, segment)
  return node === undefined ? { kind: 'absent' } : { kind: 'value', value: plain(node) }
}

export function toolSettingDefinitions(
  input: Readonly<{ name: string; version: string | undefined; declaration: BodySettings }>,
): SettingDefinitions {
  const { name, declaration } = input
  const items: SettingItem[] = declaration.items.map(item => {
    const id = item.path.join('.')
    return {
      id,
      groupId: TOOL_SETTINGS_GROUP,
      category: item.category,
      presentation: item.presentation,
      valueSchema: schemaAt(declaration.schema, item.path, id),
      default: item.sensitive ? { kind: 'absent' } : defaultAt(declaration.defaults, item.path),
      merge: 'override',
      sensitivity: item.sensitive ? 'secret' : 'ordinary',
    }
  })
  return {
    providerId: TOOL_SETTINGS_PROVIDER,
    definitionId: settingsIdText(name),
    version: settingsIdText(input.version ?? UNPINNED_VERSION),
    groups: [
      {
        id: TOOL_SETTINGS_GROUP,
        parentId: null,
        title: 'Tool settings',
        description: `The settings the tool ${name} declares.`,
        order: 0,
      },
    ],
    items,
  }
}
