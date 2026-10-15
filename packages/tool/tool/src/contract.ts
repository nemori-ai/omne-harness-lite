import {
  capabilityId,
  refusal,
  type BodyContract,
  type Declarations,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'

const schema: JsonValue = {
  kind: 'tool-body',
  properties: { name: 'string', composes: { skills: 'string[]' } },
}

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
      const names = skillNames(recordOf(body)?.composes)
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
  const record = recordOf(body)
  const name = record?.name
  if (typeof name !== 'string' || name === '') return refusal('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName) return refusal('name-mismatch')
  if (skillNames(record?.composes) === undefined) return refusal('incomplete-reference')
  return { ok: true }
}

function skillNames(composes: unknown): readonly string[] | undefined {
  if (composes === undefined) return []
  const record = recordOf(composes)
  if (record === undefined) return undefined
  return stringList(record.skills)
}

function stringList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value)) return undefined
  if (value.some(item => typeof item !== 'string' || item === '')) return undefined
  return value as string[]
}

function recordOf(body: unknown): { [key: string]: unknown } | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined
  return body as { [key: string]: unknown }
}
