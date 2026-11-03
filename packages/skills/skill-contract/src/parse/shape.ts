// The shapes of dependency, script and setting declarations over a read JSON tree. Both
// `.omne/skill.json` and the asset body use them, so one rule has one place. Each reader returns
// what it read together with its findings; reading goes on after a finding, so that the caller
// can give the first code by order.
import { capabilityId, type CapabilityId, type JsonValue } from '@omne-harness/assets'
import { INSPECT_REJECTIONS, type InspectRejectionCode } from '../failures.ts'
import { toPackagePath } from '../names.ts'
import type {
  PackagePath,
  ScriptDeclaration,
  SettingCategory,
  SettingDeclaration,
} from '../values.ts'

export type Finding = Readonly<{ code: InspectRejectionCode; detail: string }>

/** What a reader read, and the findings on the way. */
export type Read<T> = Readonly<{ value: T; findings: readonly Finding[] }>

/** The finding whose code comes first in the rejection order. */
export function firstFinding(findings: readonly Finding[]): Finding | undefined {
  let first: Finding | undefined
  for (const finding of findings)
    if (first === undefined || rank(finding.code) < rank(first.code)) first = finding
  return first
}

function rank(code: InspectRejectionCode): number {
  return INSPECT_REJECTIONS.indexOf(code)
}

const malformed = (detail: string): Finding => ({ code: 'malformed', detail })

/** The longest description, in code points, of a manifest and of an asset body. */
export const DESCRIPTION_MAX = 1024

/** The fields of an object, or `undefined` when the value is not an object. */
export function fieldsOf(value: JsonValue | undefined): ReadonlyMap<string, JsonValue> | undefined {
  if (value === undefined || value.kind !== 'object') return undefined
  const fields = new Map<string, JsonValue>()
  for (let index = 0; index < value.entries.length; index += 1) {
    const entry = value.entries[index]
    if (entry !== undefined) fields.set(entry.key, entry.value)
  }
  return fields
}

/** A malformed finding for each key of the object outside `allowed`. */
export function unknownKeys(
  fields: ReadonlyMap<string, JsonValue> | undefined,
  allowed: readonly string[],
  at: string,
): Finding[] {
  return [...(fields?.keys() ?? [])]
    .filter(key => !allowed.includes(key))
    .map(key => malformed(`${at} has the unknown field ${key}`))
}

function itemsOf(value: JsonValue | undefined): readonly JsonValue[] | undefined {
  return value !== undefined && value.kind === 'array' ? value.items : undefined
}

function textOf(value: JsonValue | undefined): string | undefined {
  return value !== undefined && value.kind === 'string' ? value.value : undefined
}

const WORD = /^[a-z][a-z0-9-]{0,31}$/
const SETTING_CATEGORIES: readonly SettingCategory[] = [
  'preference',
  'binding',
  'placement-identity',
  'governance',
]

function isSettingCategory(text: string): text is SettingCategory {
  return SETTING_CATEGORIES.some(category => category === text)
}

/** Reads a list; an absent part is the empty list. Items that do not read are left out. */
function listOf<T>(
  value: JsonValue | undefined,
  part: string,
  read: (item: JsonValue, at: string) => Read<T | undefined>,
): Read<T[]> {
  if (value === undefined) return { value: [], findings: [] }
  const items = itemsOf(value)
  if (items === undefined) return { value: [], findings: [malformed(`${part} is not a list`)] }
  const parsed: T[] = []
  const findings: Finding[] = []
  items.forEach((item, index) => {
    const one = read(item, `${part}[${index}]`)
    findings.push(...one.findings)
    if (one.value !== undefined) parsed.push(one.value)
  })
  return { value: parsed, findings }
}

/** The list, with a malformed finding when two items share a key. */
function noRepeats<T>(list: Read<T[]>, keyOf: (item: T) => string, part: string): Read<T[]> {
  const keys = list.value.map(keyOf)
  if (new Set(keys).size === keys.length) return list
  return { value: list.value, findings: [...list.findings, malformed(`${part} repeats an item`)] }
}

export function readDependencies(value: JsonValue | undefined): Read<CapabilityId[]> {
  const list = listOf<CapabilityId>(value, 'dependencies', (item, at) => {
    const fields = fieldsOf(item)
    const findings = unknownKeys(fields, ['category', 'name'], at)
    const category = textOf(fields?.get('category'))
    const name = textOf(fields?.get('name'))
    if (category === undefined || name === undefined)
      return {
        value: undefined,
        findings: [...findings, malformed(`${at} is not a tool reference`)],
      }
    const id = capabilityId(category, name)
    if (category !== 'tool' || !id.ok) {
      const invalid: Finding = { code: 'tool-ref-invalid', detail: `${at} is not a tool identity` }
      return { value: undefined, findings: [...findings, invalid] }
    }
    return { value: id.id, findings }
  })
  return noRepeats(list, id => id.name, 'dependencies')
}

/**
 * The entry of a script. An absolute entry points outside the package. Any other entry that is not
 * a package path, a `..` segment included, is malformed. With `normalized`, the entry must already
 * be in the form that `toPackagePath` gives.
 */
function entryOf(raw: string, at: string, normalized: boolean): Read<PackagePath | undefined> {
  if (raw.startsWith('/')) {
    const outside: Finding = { code: 'outside-package', detail: `${at}.entry is absolute` }
    return { value: undefined, findings: [outside] }
  }
  const path = toPackagePath(raw)
  if (!('ok' in path) || (normalized && path.ok !== raw))
    return { value: undefined, findings: [malformed(`${at}.entry is not a package path`)] }
  return { value: path.ok, findings: [] }
}

function wordsOf(value: JsonValue | undefined): string[] | undefined {
  const items = itemsOf(value)
  if (items === undefined) return undefined
  const words: string[] = []
  for (const item of items) {
    const word = textOf(item)
    if (word === undefined || !WORD.test(word)) return undefined
    words.push(word)
  }
  return new Set(words).size === words.length ? words : undefined
}

/**
 * Reads script declarations. `normalized` asks for entries that are already normalized, as in an
 * asset body; `.omne/skill.json` may write `./` and other `.` segments.
 */
export function readScripts(
  value: JsonValue | undefined,
  options: Readonly<{ normalized: boolean }>,
): Read<ScriptDeclaration[]> {
  const list = listOf<ScriptDeclaration>(value, 'scripts', (item, at) => {
    const fields = fieldsOf(item)
    const findings = unknownKeys(fields, ['entry', 'runKind', 'facilities', 'parameters'], at)
    const rawEntry = textOf(fields?.get('entry'))
    const runKind = textOf(fields?.get('runKind'))
    const facilities = wordsOf(fields?.get('facilities'))
    const entry =
      rawEntry === undefined
        ? { value: undefined, findings: [] }
        : entryOf(rawEntry, at, options.normalized)
    findings.push(...entry.findings)
    if (
      fields === undefined ||
      rawEntry === undefined ||
      runKind === undefined ||
      !WORD.test(runKind) ||
      !facilities
    )
      return { value: undefined, findings: [...findings, malformed(`${at} is not a script`)] }
    if (entry.value === undefined) return { value: undefined, findings }
    const parameters = fields.get('parameters')
    const script: ScriptDeclaration = Object.freeze({
      entry: entry.value,
      runKind,
      facilities: Object.freeze(facilities),
      ...(parameters === undefined ? {} : { parameters }),
    })
    return { value: script, findings }
  })
  return noRepeats(list, script => script.entry, 'scripts')
}

export function readSettings(value: JsonValue | undefined): Read<SettingDeclaration[]> {
  const list = listOf<SettingDeclaration>(value, 'settings', (item, at) => {
    const fields = fieldsOf(item)
    const findings = unknownKeys(fields, ['name', 'category'], at)
    const name = textOf(fields?.get('name'))
    const category = textOf(fields?.get('category'))
    if (name === undefined || name === '' || category === undefined)
      return { value: undefined, findings: [...findings, malformed(`${at} is not a setting`)] }
    if (!isSettingCategory(category)) {
      const unknown: Finding = { code: 'setting-category-unknown', detail: `${at}.category` }
      return { value: undefined, findings: [...findings, unknown] }
    }
    return { value: Object.freeze({ name, category }), findings }
  })
  return noRepeats(list, setting => setting.name, 'settings')
}
