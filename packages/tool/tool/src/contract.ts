import {
  capabilityId,
  readBodyText,
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
  if (skills.kind !== 'array') return undefined
  const names: string[] = []
  for (const item of skills.items) {
    if (item.kind !== 'string' || item.value === '') return undefined
    names.push(item.value)
  }
  return names
}

function stringField(body: unknown, key: string): string | undefined {
  const value = field(body, key)
  if (value === undefined || value.kind !== 'string') return undefined
  return value.value
}

function field(body: unknown, key: string): JsonValue | undefined {
  if (!isObject(body)) return undefined
  return body.entries.find(entry => entry.key === key)?.value
}

function isObject(body: unknown): body is JsonValue & { readonly kind: 'object' } {
  return typeof body === 'object' && body !== null && 'kind' in body && body.kind === 'object' && 'entries' in body && Array.isArray(body.entries)
}
