// The shapes of declarations over a read JSON tree. Both `.omne/skill.json` and the asset body use
// them, so one rule has one place. Each reader returns what it read together with its findings;
// reading goes on after a finding, so that the caller can give the first code by order.
import { capabilityId, type CapabilityId, type JsonValue } from '@omne-harness/assets'
import { INSPECT_REJECTIONS, type InspectRejectionCode } from '../failures.ts'
import { isBoundedText } from '../names.ts'

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

/**
 * The longest description, in code points, of a manifest, an asset body, a declared projection
 * and a stand-in: one limit for the whole contract. It is larger than the 1024 of the Agent
 * Skills specification on purpose: the main hosts accept longer descriptions, and a Skill that
 * they load must be usable here too. The limit stays finite against abuse.
 */
export const DESCRIPTION_LIMIT = 16384

/** The limit of the Agent Skills specification. A longer manifest description gets a hint. */
export const SPECIFICATION_DESCRIPTION_LIMIT = 1024

/** A description of a manifest, of an asset body or of a stand-in: text of 1 to
 * `DESCRIPTION_LIMIT` characters, counted in code points. */
export function isSkillDescription(value: unknown): value is string {
  return isBoundedText(value, DESCRIPTION_LIMIT)
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
