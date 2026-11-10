// The projection of a tool's settings declaration (P15) into the definition shape of
// `@omne-harness/settings`. It is a pure function over a judged declaration: it reads the paths,
// categories, sensitivity, presentations, the schema at each path and the declared defaults; it
// decides the Settings identity of the definition, the one group and the merge rule. A sensitive
// item becomes a secret item, whose value never passes through Settings, so its default is absent
// whatever the declaration's defaults say. Whether the result is a legal Settings definition is
// still `defineSettings`' judgment; the assembly that registers it runs that judgment.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { SettingDefinitions, SettingItem } from '@omne-harness/settings'
import type { ToolSettingsDeclaration } from './authoring.ts'
import type { Adoption } from './identity.ts'

/** The one group every projected item sits in. */
const TOOL_SETTINGS_GROUP = 'tool'

/** The prefix of a provider id: it says the id encodes the owner of a tool adoption. */
const PROVIDER_PREFIX = 'tool:'

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

function memberOf(
  tree: JsonValue | undefined,
  key: string,
): Extract<JsonValue, { kind: 'object' }>['entries'][number]['value'] | undefined {
  if (tree === undefined || tree.kind !== 'object') return undefined
  return tree.entries.find(entry => entry.key === key)?.value
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
 * Projects the settings declaration of one tool into a Settings definition, or `null` when the
 * tool declares no settings. The provider id encodes the adoption owner (an npm-style name is not
 * a Settings id as it is), the definition id is the tool name and the version is the adoption
 * digest, so two contents of one tool are two versions and never a registry conflict. An item's
 * id is its path joined with `.`; its presentation and category are the declared ones; its value
 * schema is the declaration's schema at that path. A sensitive item is `secret` with an absent
 * default; an ordinary item takes the declared default when there is one.
 */
export function toolSettingDefinitions(
  input: Readonly<{
    adoption: Adoption
    name: string
    declaration: ToolSettingsDeclaration | null
  }>,
): SettingDefinitions | null {
  const { adoption, name, declaration } = input
  if (declaration === null) return null
  const items: SettingItem[] = declaration.items.map(item => {
    const id = item.path.join('.')
    return {
      id,
      groupId: TOOL_SETTINGS_GROUP,
      category: item.category,
      presentation: item.presentation,
      valueSchema: schemaAt(declaration.schema.schema, item.path, id),
      default: item.sensitive ? { kind: 'absent' } : defaultAt(declaration.defaults, item.path),
      merge: 'override',
      sensitivity: item.sensitive ? 'secret' : 'ordinary',
    }
  })
  return {
    providerId: `${PROVIDER_PREFIX}${settingsIdText(adoption.owner)}`,
    definitionId: settingsIdText(name),
    version: settingsIdText(adoption.digest),
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
