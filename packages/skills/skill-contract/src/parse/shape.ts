// The shapes of dependency, script and setting declarations over a read JSON tree. Both
// `.omne/skill.json` and the asset body use them, so one rule has one place. A rule that fails
// adds its rejection code to the findings; reading goes on, so that the first code by order wins.
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
export type Findings = Finding[]

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

/** Adds a malformed finding when the object has a key outside `allowed`. */
export function onlyKeys(
  fields: ReadonlyMap<string, JsonValue>,
  allowed: readonly string[],
  at: string,
  findings: Findings,
): void {
  for (const key of fields.keys())
    if (!allowed.includes(key))
      findings.push({ code: 'malformed', detail: `${at} has the unknown field ${key}` })
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

/** Reads a list; an absent part is the empty list. */
function listOf<T>(
  value: JsonValue | undefined,
  part: string,
  findings: Findings,
  read: (item: JsonValue, at: string) => T | undefined,
): T[] {
  if (value === undefined) return []
  const items = itemsOf(value)
  if (items === undefined) {
    findings.push({ code: 'malformed', detail: `${part} is not a list` })
    return []
  }
  const parsed: T[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const one = item === undefined ? undefined : read(item, `${part}[${index}]`)
    if (one !== undefined) parsed.push(one)
  }
  return parsed
}

function noRepeats(keys: readonly string[], part: string, findings: Findings): void {
  if (new Set(keys).size !== keys.length)
    findings.push({ code: 'malformed', detail: `${part} repeats an item` })
}

export function readDependencies(value: JsonValue | undefined, findings: Findings): CapabilityId[] {
  const dependencies = listOf(value, 'dependencies', findings, (item, at) => {
    const fields = fieldsOf(item)
    if (fields !== undefined) onlyKeys(fields, ['category', 'name'], at, findings)
    const category = textOf(fields?.get('category'))
    const name = textOf(fields?.get('name'))
    if (category === undefined || name === undefined) {
      findings.push({ code: 'malformed', detail: `${at} is not a tool reference object` })
      return undefined
    }
    const id = capabilityId(category, name)
    if (category !== 'tool' || !id.ok) {
      findings.push({ code: 'tool-ref-invalid', detail: `${at} is not a tool identity` })
      return undefined
    }
    return id.id
  })
  noRepeats(
    dependencies.map(id => id.name),
    'dependencies',
    findings,
  )
  return dependencies
}

/** Where a script entry points: inside the package, outside it, or not a path at all. */
function entryOf(raw: string, at: string, findings: Findings): PackagePath | undefined {
  if (raw.startsWith('/') || raw.split('/').includes('..')) {
    findings.push({ code: 'outside-package', detail: `${at}.entry points outside the package` })
    return undefined
  }
  const path = toPackagePath(raw)
  if ('ok' in path) return path.ok
  findings.push({ code: 'malformed', detail: `${at}.entry is not a package path` })
  return undefined
}

function wordsOf(value: JsonValue | undefined): string[] | undefined {
  const items = itemsOf(value)
  if (items === undefined) return undefined
  const words: string[] = []
  for (let index = 0; index < items.length; index += 1) {
    const word = textOf(items[index])
    if (word === undefined || !WORD.test(word)) return undefined
    words.push(word)
  }
  return new Set(words).size === words.length ? words : undefined
}

export function readScripts(value: JsonValue | undefined, findings: Findings): ScriptDeclaration[] {
  const scripts = listOf(value, 'scripts', findings, (item, at) => {
    const fields = fieldsOf(item)
    if (fields !== undefined)
      onlyKeys(fields, ['entry', 'runKind', 'facilities', 'parameters'], at, findings)
    const rawEntry = textOf(fields?.get('entry'))
    const runKind = textOf(fields?.get('runKind'))
    const facilities = wordsOf(fields?.get('facilities'))
    const entry = rawEntry === undefined ? undefined : entryOf(rawEntry, at, findings)
    if (fields === undefined || runKind === undefined || !WORD.test(runKind) || !facilities) {
      findings.push({ code: 'malformed', detail: `${at} is not a script declaration` })
      return undefined
    }
    if (entry === undefined) return undefined
    const parameters = fields.get('parameters')
    return Object.freeze({
      entry,
      runKind,
      facilities: Object.freeze(facilities),
      ...(parameters === undefined ? {} : { parameters }),
    })
  })
  noRepeats(
    scripts.map(script => script.entry),
    'scripts',
    findings,
  )
  return scripts
}

export function readSettings(
  value: JsonValue | undefined,
  findings: Findings,
): SettingDeclaration[] {
  const settings = listOf(value, 'settings', findings, (item, at) => {
    const fields = fieldsOf(item)
    if (fields !== undefined) onlyKeys(fields, ['name', 'category'], at, findings)
    const name = textOf(fields?.get('name'))
    const category = textOf(fields?.get('category'))
    if (name === undefined || name === '' || category === undefined) {
      findings.push({ code: 'malformed', detail: `${at} is not a setting declaration` })
      return undefined
    }
    if (!isSettingCategory(category)) {
      findings.push({ code: 'setting-category-unknown', detail: `${at}.category is unknown` })
      return undefined
    }
    return Object.freeze({ name, category })
  })
  noRepeats(
    settings.map(setting => setting.name),
    'settings',
    findings,
  )
  return settings
}
