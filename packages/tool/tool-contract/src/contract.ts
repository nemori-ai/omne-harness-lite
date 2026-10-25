import {
  capabilityId,
  isReadBody,
  readBodyText,
  readSnapshot,
  refusal,
  type BodyContract,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'

const schemaRead = readBodyText(
  '{"kind":"tool-body","properties":{"name":"string","programmable":"boolean","requiredCapabilities":"string[]","composes":{"skills":"string[]"},"implementation":{"executor":"string","module":"string","construction":"json"}}}',
  {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 200,
    maxNumberLength: 20,
  },
)
if (schemaRead.kind !== 'ok') throw new TypeError('tool schema text is not a document')
const schema: JsonValue = schemaRead.value

export function toolBodyContract(): BodyContract {
  return {
    category: 'tool',
    schema,
    judge,
    deriveDeclarations(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError(`tool body failed judgment: ${decision.rejected}`)
      // Only boolean true permits programmatic calls. An omitted or false value declares nothing.
      return { entries: programmable(body) === true ? [PROGRAMMABLE_DECLARATION] : [] }
    },
    references(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError(`tool body failed judgment: ${decision.rejected}`)
      const names = skillNames(body)
      if (names === undefined)
        throw new TypeError('tool body failed judgment: incomplete-reference')
      return names.map(name => {
        const id = capabilityId('skill', name)
        if (!id.ok) throw new TypeError('tool body failed judgment: incomplete-reference')
        return id.id
      })
    },
  }
}

function judge(body: unknown, context?: { capabilityName?: string }): Judgment {
  if (!isReadBody(body)) return refusal('incomplete-reference')
  const name = stringField(body, 'name')
  if (name === undefined || name === '') return refusal('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName)
    return refusal('name-mismatch')
  if (skillNames(body) === undefined) return refusal('incomplete-reference')
  if (programmable(body) === 'invalid') return refusal('invalid-programmable')
  if (requiredCapabilities(body) === undefined) return refusal('invalid-required-capabilities')
  if (implementation(body) === 'invalid') return refusal('invalid-implementation')
  return { ok: true }
}

/**
 * `requiredCapabilities` is optional (RFC-0012 governance). When present it is a list of
 * non-empty names; anything else is undefined, which the judgment refuses.
 */
function requiredCapabilities(body: unknown): readonly string[] | undefined {
  const value = field(body, 'requiredCapabilities')
  if (value === undefined) return isObject(body) ? [] : undefined
  if (value.kind !== 'array' || !Array.isArray(value.items)) return undefined
  const names: string[] = []
  for (let index = 0; index < value.items.length; index += 1) {
    const item = value.items[index]
    if (item === undefined || item.kind !== 'string' || item.value === '') return undefined
    names.push(item.value)
  }
  return names
}

/**
 * `implementation { executor, module, construction }` is the implementation reference of the
 * asset (RFC-0012). It is optional: a body without it declares no implementation and cannot be
 * loaded. When present, `executor` and `module` are non-empty texts and `construction` is any JSON
 * value; a missing `construction` reads as JSON null.
 */
function implementation(body: unknown): 'absent' | 'present' | 'invalid' {
  const value = field(body, 'implementation')
  if (value === undefined) return 'absent'
  if (!isObject(value)) return 'invalid'
  const executor = stringField(value, 'executor')
  const module = stringField(value, 'module')
  if (executor === undefined || executor === '' || module === undefined || module === '')
    return 'invalid'
  return 'present'
}

/** The declaration entry of a tool body whose `programmable` is boolean true. */
const PROGRAMMABLE_DECLARATION = 'programmable'

/** `programmable` is optional and boolean. A string, number or null is not converted. */
function programmable(body: unknown): boolean | 'invalid' | undefined {
  const value = field(body, 'programmable')
  if (value === undefined) return undefined
  if (value.kind !== 'boolean' || typeof value.value !== 'boolean') return 'invalid'
  return value.value
}

function skillNames(body: unknown): readonly string[] | undefined {
  const composes = field(body, 'composes')
  if (composes === undefined) return isObject(body) ? [] : undefined
  if (!isObject(composes)) return undefined
  const skills = field(composes, 'skills')
  if (skills === undefined) return []
  if (!isReadBody(skills) || skills.kind !== 'array' || !Array.isArray(skills.items))
    return undefined
  const names: string[] = []
  for (let index = 0; index < skills.items.length; index += 1) {
    const item = skills.items[index]
    if (
      !isReadBody(item) ||
      item.kind !== 'string' ||
      typeof item.value !== 'string' ||
      item.value === ''
    )
      return undefined
    names.push(item.value)
  }
  return names
}

function stringField(body: unknown, key: string): string | undefined {
  const value = field(body, key)
  if (value === undefined || value.kind !== 'string' || typeof value.value !== 'string')
    return undefined
  return value.value
}

function field(body: unknown, key: string): JsonValue | undefined {
  const document = readSnapshot(body)
  if (document === undefined || document.kind !== 'object' || !Array.isArray(document.entries))
    return undefined
  for (let index = 0; index < document.entries.length; index += 1) {
    const entry = document.entries[index]
    if (entry === undefined || entry.key !== key) continue
    return entry.value
  }
  return undefined
}

function isObject(body: unknown): boolean {
  const document = readSnapshot(body)
  return document !== undefined && document.kind === 'object' && Array.isArray(document.entries)
}
