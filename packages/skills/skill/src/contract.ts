import {
  capabilityId,
  isReadBody,
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
  if (!isReadBody(body)) return refusal('incomplete-reference')
  const name = stringField(body, 'name')
  if (name === undefined || name === '') return refusal('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName) return refusal('name-mismatch')
  if (toolRefs(body) === undefined) return refusal('incomplete-reference')
  return { ok: true }
}

function toolRefs(body: unknown): readonly { category: string; name: string }[] | undefined {
  const tools = field(body, 'tools')
  if (tools === undefined) return isObject(body) ? [] : undefined
  if (!isReadBody(tools) || tools.kind !== 'array' || !Array.isArray(tools.items)) return undefined
  const refs: { category: string; name: string }[] = []
  for (let index = 0; index < tools.items.length; index += 1) {
    const item = tools.items[index]
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
  if (value === undefined || value.kind !== 'string' || typeof value.value !== 'string') return undefined
  return value.value
}

function field(body: unknown, key: string): JsonValue | undefined {
  if (!isObject(body)) return undefined
  for (let index = 0; index < body.entries.length; index += 1) {
    const entry = body.entries[index]
    if (typeof entry !== 'object' || entry === null || entry.key !== key) continue
    return entry.value
  }
  return undefined
}

function isObject(body: unknown): body is JsonValue & { readonly kind: 'object' } {
  return isReadBody(body) && body.kind === 'object' && Array.isArray(body.entries)
}
