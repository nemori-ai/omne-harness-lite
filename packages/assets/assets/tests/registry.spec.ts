import { expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryRegistry,
  pinBody,
  readBodyText,
  unknownCategory,
  type BodyContract,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/assets'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 100,
  maxStringLength: 100,
  maxNumberLength: 100,
}

function document(text: string): JsonValue {
  const read = readBodyText(text, limits)
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

it('rejects an empty category name before it can be registered', () => {
  const registry = createCategoryRegistry()
  expect(() =>
    registry.register({
      category: '',
      schema: { kind: 'null' },
      judge: () => ({ ok: true }),
      deriveDeclarations: () => ({ entries: [] }),
      references: () => [],
    }),
  ).toThrow(/category name is empty/)
})

it('rejects an identity that omits category or name', () => {
  expect(capabilityId('', 'read_file')).toEqual({ ok: false, rejected: 'incomplete-reference' })
  expect(capabilityId('tool', '')).toEqual({ ok: false, rejected: 'incomplete-reference' })
})

it('keeps pinned content after the caller changes the read document', () => {
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  const body = document('{"name":"read_file","composes":{"skills":["review"]}}')
  const pinned = pinBody({
    identity: id.id,
    version: 'v3',
    source: 'workspace-w',
    body,
  })
  if (body.kind !== 'object') throw new Error('object')
  const composes = body.entries[1]?.value
  if (composes?.kind !== 'object') throw new Error('composes')
  const skills = composes.entries[0]?.value
  if (skills?.kind !== 'array') throw new Error('skills')
  const skill = skills.items[0]
  if (skill?.kind !== 'string') throw new Error('skill')
  ;(skill as { value: string }).value = 'replacement'
  expect(pinned.body).not.toBe(body)
  expect(pinned.version).toBe('v3')
  expect(pinned.source).toBe('workspace-w')
  if (pinned.body.kind !== 'object') throw new Error('pinned')
  const pinnedComposes = pinned.body.entries[1]?.value
  if (pinnedComposes?.kind !== 'object') throw new Error('pinned composes')
  const pinnedSkills = pinnedComposes.entries[0]?.value
  if (pinnedSkills?.kind !== 'array' || pinnedSkills.items[0]?.kind !== 'string') throw new Error('pinned skill')
  expect(pinnedSkills.items[0].value).toBe('review')
})

it('rejects a pin whose body was not read', () => {
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  expect(() => pinBody({ identity: id.id, version: 'v3', source: 'workspace-w', body: { name: 'read_file' } })).toThrow(/body was not read/)
})

it('rejects a second registration of the same category and reports an unknown category', () => {
  const registry = createCategoryRegistry()
  const tool = contract('tool')
  registry.register(tool)
  expect(() => registry.register(contract('tool'))).toThrow(/already registered/)
  expect(registry.lookup('tool')?.category).toBe('tool')
  expect(registry.lookup('tool')?.judge(document('{"name":"read_file"}'))).toEqual({ ok: true })
  expect(unknownCategory(registry, 'mcp')).toEqual({ ok: false, rejected: 'unknown-category' })
  expect(unknownCategory(registry, 'tool').ok).toBe(true)
})

it('stores two category ports without reading their bodies', () => {
  const registry = createCategoryRegistry()
  const tool = contract('tool')
  const skill = contract('skill')
  registry.register(tool)
  registry.register(skill)
  expect(registry.lookup('tool')?.judge(document('{"name":"read_file"}'))).toEqual({ ok: true })
  expect(registry.lookup('skill')?.judge(document('{"name":"review"}'))).toEqual({ ok: true })
  expect(registry.lookup('tool')?.judge(document('{"name":"review"}'))).toEqual({ ok: false, rejected: 'name-mismatch' })
})

function contract(category: string): BodyContract {
  return {
    category,
    schema: { kind: 'null' },
    judge(body) {
      const record = body as JsonValue
      const name = record.kind === 'object' ? record.entries.find(entry => entry.key === 'name')?.value : undefined
      const text = name?.kind === 'string' ? name.value : undefined
      if (text === category || (category === 'tool' && text === 'read_file') || (category === 'skill' && text === 'review')) {
        return { ok: true }
      }
      return { ok: false, rejected: 'name-mismatch' }
    },
    deriveDeclarations() {
      return { entries: [] }
    },
    references() {
      return []
    },
  }
}
