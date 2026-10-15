import {
  capabilityId,
  readBodyText,
  refusal,
  type BodyContract,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'

const schemaRead = readBodyText(
  '{"kind":"skill-body","properties":{"name":"string","tools":{"category":"tool","name":"string"}}}',
  {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 200,
    maxNumberLength: 20,
  },
)
if (schemaRead.kind !== 'ok') throw new TypeError('skill schema text is not a document')
const schema: JsonValue = schemaRead.value

export function skillBodyContract(): BodyContract {
  return {
    category: 'skill',
    schema,
    judge,
    deriveDeclarations(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError('skill body failed judgment')
      return { entries: [] }
    },
    references(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError('skill body failed judgment')
      const refs = toolRefs(body)
      if (refs === undefined) throw new TypeError('skill body failed judgment')
      return refs.map(ref => {
        const id = capabilityId(ref.category, ref.name)
        if (!id.ok) throw new TypeError('skill body failed judgment')
        return id.id
      })
    },
  }
}

function judge(body: unknown, context?: { capabilityName?: string }): Judgment {
  const name = stringField(body, 'name')
  if (name === undefined || name === '') return refusal('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName) return refusal('name-mismatch')
  if (toolRefs(body) === undefined) return refusal('incomplete-reference')
  return { ok: true }
}

function toolRefs(body: unknown): readonly { category: string; name: string }[] | undefined {
  const tools = field(body, 'tools')
  if (tools === undefined) return isObject(body) ? [] : undefined
  if (tools.kind !== 'array') return undefined
  const refs: { category: string; name: string }[] = []
  for (const item of tools.items) {
    if (!isObject(item)) return undefined
    const category = stringField(item, 'category')
    const name = stringField(item, 'name')
    if (category !== 'tool' || name === undefined || name === '') return undefined
    refs.push({ category, name })
  }
  return refs
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
