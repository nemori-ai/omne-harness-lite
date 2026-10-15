import { capabilityId, type BodyContract, type JsonValue } from '@omne-harness/assets'

const schema: JsonValue = { kind: 'tool-body' }

export function toolBodyContract(): BodyContract {
  return Object.freeze({
    category: 'tool',
    schema,
    judge(body, context) {
      const record = recordOf(body)
      if (record === undefined || typeof record.name !== 'string' || record.name === '') {
        return Object.freeze({ rejected: 'incomplete-reference' })
      }
      if (context?.capabilityName !== undefined && record.name !== context.capabilityName) {
        return Object.freeze({ rejected: 'name-mismatch' })
      }
      if (!skillNames(record.composes)) return Object.freeze({ rejected: 'incomplete-reference' })
      return Object.freeze({ ok: true })
    },
    deriveDeclarations(body) {
      assertJudged(body)
      return Object.freeze({ entries: Object.freeze([]) })
    },
    references(body) {
      const record = assertJudged(body)
      const names = skillNames(record.composes)
      if (names === undefined) throw new TypeError('tool body failed judgment')
      return Object.freeze(
        names.map(name => {
          const id = capabilityId('skill', name)
          if (!id.ok) throw new TypeError('skill reference is incomplete')
          return id.id
        }),
      )
    },
  })
}

function assertJudged(body: unknown): Record<string, unknown> {
  const record = recordOf(body)
  if (record === undefined || typeof record.name !== 'string' || record.name === '') {
    throw new TypeError('tool body failed judgment')
  }
  if (!skillNames(record.composes)) throw new TypeError('tool body failed judgment')
  return record
}

function recordOf(body: unknown): Record<string, unknown> | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined
  return body as Record<string, unknown>
}

function skillNames(composes: unknown): readonly string[] | undefined {
  if (composes === undefined) return []
  if (composes === null || typeof composes !== 'object' || Array.isArray(composes)) return undefined
  const skills = (composes as { skills?: unknown }).skills
  if (skills === undefined) return []
  if (!Array.isArray(skills) || skills.some(item => typeof item !== 'string' || item === '')) return undefined
  return skills as string[]
}
