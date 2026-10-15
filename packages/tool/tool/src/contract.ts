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
  '{"kind":"tool-body","properties":{"name":"string","composes":{"skills":"string[]"}}}',
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
      if (!decision.ok) throw new TypeError('tool body failed judgment')
      return { entries: [] }
    },
    references(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError('tool body failed judgment')
      const names = skillNames(body)
      if (names === undefined) throw new TypeError('tool body failed judgment')
      return names.map(name => {
        const id = capabilityId('skill', name)
        if (!id.ok) throw new TypeError('tool body failed judgment')
        return id.id
      })
    },
  }
}

function judge(body: unknown, context?: { capabilityName?: string }): Judgment {
  if (!isReadBody(body)) return refusal('incomplete-reference')
  const name = stringField(body, 'name')
  if (name === undefined || name === '') return refusal('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName) return refusal('name-mismatch')
  if (skillNames(body) === undefined) return refusal('incomplete-reference')
  return { ok: true }
}

function skillNames(body: unknown): readonly string[] | undefined {
  const composes = field(body, 'composes')
  if (composes === undefined) return isObject(body) ? [] : undefined
  if (!isObject(composes)) return undefined
  const skills = field(composes, 'skills')
  if (skills === undefined) return []
  if (!isReadBody(skills) || skills.kind !== 'array' || !Array.isArray(skills.items)) return undefined
  const names: string[] = []
  for (let index = 0; index < skills.items.length; index += 1) {
    const item = skills.items[index]
    if (!isReadBody(item) || item.kind !== 'string' || typeof item.value !== 'string' || item.value === '') return undefined
    names.push(item.value)
  }
  return names
}

function stringField(body: unknown, key: string): string | undefined {
  const value = field(body, key)
  if (value === undefined || value.kind !== 'string' || typeof value.value !== 'string') return undefined
  return value.value
}

function field(body: unknown, key: string): JsonValue | undefined {
  const document = readSnapshot(body)
  if (document === undefined || document.kind !== 'object' || !Array.isArray(document.entries)) return undefined
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
