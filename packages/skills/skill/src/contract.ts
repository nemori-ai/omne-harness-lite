import { capabilityId, type BodyContract, type JsonValue } from '@omne-harness/assets'

const schema: JsonValue = { kind: 'skill-body' }

export function skillBodyContract(): BodyContract {
  return Object.freeze({
    category: 'skill',
    schema,
    judge(body, context) {
      const record = recordOf(body)
      if (record === undefined || typeof record.name !== 'string' || record.name === '') {
        return Object.freeze({ rejected: 'incomplete-reference' })
      }
      if (context?.capabilityName !== undefined && record.name !== context.capabilityName) {
        return Object.freeze({ rejected: 'name-mismatch' })
      }
      if (toolRefs(record.tools) === undefined) return Object.freeze({ rejected: 'incomplete-reference' })
      return Object.freeze({ ok: true })
    },
    deriveDeclarations(body) {
      assertJudged(body)
      return Object.freeze({ entries: Object.freeze([]) })
    },
    references(body) {
      const record = assertJudged(body)
      const refs = toolRefs(record.tools)
      if (refs === undefined) throw new TypeError('skill body failed judgment')
      return Object.freeze(
        refs.map(ref => {
          const id = capabilityId(ref.category, ref.name)
          if (!id.ok) throw new TypeError('tool reference is incomplete')
          return id.id
        }),
      )
    },
  })
}

function assertJudged(body: unknown): Record<string, unknown> {
  const record = recordOf(body)
  if (record === undefined || typeof record.name !== 'string' || record.name === '') {
    throw new TypeError('skill body failed judgment')
  }
  if (toolRefs(record.tools) === undefined) throw new TypeError('skill body failed judgment')
  return record
}

function recordOf(body: unknown): Record<string, unknown> | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined
  return body as Record<string, unknown>
}

function toolRefs(tools: unknown): readonly { category: string; name: string }[] | undefined {
  if (tools === undefined) return []
  if (!Array.isArray(tools)) return undefined
  const refs: { category: string; name: string }[] = []
  for (const item of tools) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined
    const category = (item as { category?: unknown }).category
    const name = (item as { name?: unknown }).name
    if (typeof category !== 'string' || category === '' || typeof name !== 'string' || name === '') {
      return undefined
    }
    if (category !== 'tool') return undefined
    refs.push({ category, name })
  }
  return refs
}
