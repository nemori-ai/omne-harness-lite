import {
  capabilityId,
  refusal,
  type BodyContract,
  type Judgment,
} from '@omne-harness/assets'

const schema = {
  kind: 'skill-body',
  properties: { name: 'string', tools: { category: 'tool', name: 'string' } },
} as const

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
      const refs = toolRefs(recordOf(body)?.tools)
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
  const record = recordOf(body)
  const name = record?.name
  if (typeof name !== 'string' || name === '') return refusal('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName) return refusal('name-mismatch')
  if (toolRefs(record?.tools) === undefined) return refusal('incomplete-reference')
  return { ok: true }
}

function toolRefs(tools: unknown): readonly { category: string; name: string }[] | undefined {
  if (tools === undefined) return []
  if (!Array.isArray(tools)) return undefined
  const refs: { category: string; name: string }[] = []
  for (const item of tools) {
    const id = toolIdentity(item)
    if (id === undefined) return undefined
    refs.push(id)
  }
  return refs
}

function toolIdentity(item: unknown): { category: string; name: string } | undefined {
  const record = recordOf(item)
  if (record === undefined) return undefined
  const category = record.category
  const name = record.name
  if (typeof category !== 'string' || category === '' || typeof name !== 'string' || name === '') return undefined
  if (category !== 'tool') return undefined
  return { category, name }
}

function recordOf(body: unknown): { [key: string]: unknown } | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined
  return body as { [key: string]: unknown }
}
