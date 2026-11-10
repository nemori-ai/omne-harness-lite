// The settings a tool asset body declares (P15) and their projection into the definition shape of
// `@omne-harness/settings`. The body carries the declaration as `settings { schema, defaults,
// items }`; `bodySettings` reads it from a judged body, and `toolSettingDefinitions` projects it.
// The projection reads the paths, categories, sensitivity, presentations, the schema at each path
// and the declared defaults; it decides the definition id, the one group and the merge rule. A
// sensitive item becomes a secret item, whose value never passes through Settings, so its default
// is absent whatever the declaration's defaults say. Whether the result is a legal Settings
// definition is still `defineSettings`' judgment, which `projectAssetSettings` runs.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { SettingDefinitions, SettingItem } from '@omne-harness/settings'
import type { ToolSettingPresentation, ToolSettingsDeclaration } from './authoring.ts'

/** The settings declaration as a tool asset body carries it: the schema is the JSON Schema tree. */
export type BodySettings = Readonly<{
  schema: JsonValue
  defaults: JsonValue
  items: ToolSettingsDeclaration['items']
}>

/** The provider id of every projected definition: the category. The assembly that holds the asset
 * registers the definition under the asset reference instead. */
const TOOL_SETTINGS_PROVIDER = 'tool'

/** The one group every projected item sits in. */
const TOOL_SETTINGS_GROUP = 'tool'

/** The version of a definition projected without a pinned version. */
const UNPINNED_VERSION = '0'

const CATEGORIES: ReadonlySet<string> = new Set([
  'preference',
  'binding',
  'placement-identity',
  'governance',
])

/** The characters a Settings id keeps as they are; `_` is the escape of everything else. */
const ID_LITERAL = /^[a-zA-Z0-9.:/-]$/u

/**
 * An injective encoding of a text into the Settings id alphabet: a literal character stays, any
 * other code point becomes `_<hex>_`. The underscore is not a literal, so an escape is never read
 * as text. The first character of a Settings id must be a letter or a digit; a text that starts
 * otherwise is encoded all the same, and `defineSettings` refuses the result (fail closed).
 */
function settingsIdText(text: string): string {
  let out = ''
  for (const character of text)
    out += ID_LITERAL.test(character) ? character : `_${character.codePointAt(0)!.toString(16)}_`
  return out
}

type Json = Extract<SettingItem['default'], { kind: 'value' }>['value']

/** The value a json-text tree stands for, as plain JSON. */
function plain(tree: JsonValue): Json {
  return JSON.parse(writeJsonText(tree)) as Json
}

function memberOf(tree: JsonValue | undefined, key: string): JsonValue | undefined {
  if (tree === undefined || tree.kind !== 'object') return undefined
  return tree.entries.find(entry => entry.key === key)?.value
}

/**
 * The settings a body declares: `null` when it declares none, `'invalid'` when `settings` is not
 * an object with a `schema` object, a `defaults` value and a list of items, each with a non-empty
 * path of non-empty segments, a known category, a boolean `sensitive` and a presentation object.
 * The presentation fields are `defineSettings`' judgment.
 */
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

/**
 * The JSON Schema object at a declared path: the declaration's schema describes an object whose
 * `properties` hold one schema per segment. A path the schema does not describe is a defect of
 * the declaration, not a setting without constraints.
 */
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

/** The declared default at a path, as a presence: absent when no default sits there. */
function defaultAt(defaults: JsonValue, path: readonly string[]): SettingItem['default'] {
  let node: JsonValue | undefined = defaults
  for (const segment of path) node = memberOf(node, segment)
  return node === undefined ? { kind: 'absent' } : { kind: 'value', value: plain(node) }
}

/**
 * Projects the settings a tool body declares into a Settings definition. The definition id is the
 * tool name and the version is the pinned version of the body, both in the Settings id alphabet,
 * so two contents of one tool are two versions and never a registry conflict. An item's id is its
 * path joined with `.`; its presentation and category are the declared ones; its value schema is
 * the declaration's schema at that path. A sensitive item is `secret` with an absent default; an
 * ordinary item takes the declared default when there is one.
 */
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
