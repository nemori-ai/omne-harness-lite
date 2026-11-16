import { capabilityId, type CapabilityId, type JsonValue } from '@omne-harness/assets'
import { INSPECT_REJECTIONS, type InspectRejectionCode } from '../failures.ts'
import { isBoundedText } from '../names.ts'
import type { SettingCategory, SettingDeclaration } from '../values.ts'

export type Finding = Readonly<{ code: InspectRejectionCode; detail: string }>

export type Read<T> = Readonly<{ value: T; findings: readonly Finding[] }>

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

export const DESCRIPTION_LIMIT = 16384

export const SPECIFICATION_DESCRIPTION_LIMIT = 1024

export function isSkillDescription(value: unknown): value is string {
  return isBoundedText(value, DESCRIPTION_LIMIT)
}

export function fieldsOf(value: JsonValue | undefined): ReadonlyMap<string, JsonValue> | undefined {
  if (value === undefined || value.kind !== 'object') return undefined
  const fields = new Map<string, JsonValue>()
  for (let index = 0; index < value.entries.length; index += 1) {
    const entry = value.entries[index]
    if (entry !== undefined) fields.set(entry.key, entry.value)
  }
  return fields
}

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

const SETTING_CATEGORIES: readonly SettingCategory[] = ['preference', 'binding']

export function isSettingCategory(value: unknown): value is SettingCategory {
  return SETTING_CATEGORIES.some(category => category === value)
}

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
