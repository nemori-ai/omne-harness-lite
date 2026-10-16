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

it('copies a deep schema without overflowing the stack and rejects a cycle', () => {
  const registry = createCategoryRegistry()
  let schema: { kind: 'array'; items: unknown[] } = {
    kind: 'array',
    items: [{ kind: 'number', lexeme: '0' }],
  }
  for (let depth = 0; depth < 4000; depth += 1) schema = { kind: 'array', items: [schema] }
  registry.register({
    category: 'deep',
    schema: schema as never,
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  })
  expect(registry.lookup('deep')?.schema.kind).toBe('array')
  const cycle: { kind: 'array'; items: unknown[] } = { kind: 'array', items: [] }
  cycle.items.push(cycle)
  expect(() =>
    registry.register({
      category: 'cycle',
      schema: cycle as never,
      judge: () => ({ ok: true }),
      deriveDeclarations: () => ({ entries: [] }),
      references: () => [],
    }),
  ).toThrow(/schema could not be copied/)
})

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
  expect(() => {
    ;(skill as { value: string }).value = 'replacement'
  }).toThrow(TypeError)
  expect(pinned.body).not.toBe(body)
  expect(pinned.version).toBe('v3')
  expect(pinned.source).toBe('workspace-w')
  if (pinned.body.kind !== 'object') throw new Error('pinned')
  const pinnedComposes = pinned.body.entries[1]?.value
  if (pinnedComposes?.kind !== 'object') throw new Error('pinned composes')
  const pinnedSkills = pinnedComposes.entries[0]?.value
  if (pinnedSkills?.kind !== 'array' || pinnedSkills.items[0]?.kind !== 'string')
    throw new Error('pinned skill')
  expect(pinnedSkills.items[0].value).toBe('review')
})

it('does not call getters or iterators installed after the body was read', () => {
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  const body = document('{"name":"read_file","composes":{"skills":["review"]}}')
  if (body.kind !== 'object') throw new Error('object')
  const name = body.entries[0]?.value
  if (name?.kind !== 'string') throw new Error('name')
  let reads = 0
  expect(() =>
    Object.defineProperty(name, 'value', {
      get() {
        reads += 1
        return 'other'
      },
    }),
  ).toThrow(TypeError)
  let iterations = 0
  expect(() => {
    body.entries[Symbol.iterator] = function () {
      iterations += 1
      return Array.prototype[Symbol.iterator].call(this)
    }
  }).toThrow(TypeError)
  const pinned = pinBody({ identity: id.id, version: 'v3', source: 'workspace-w', body })
  expect(reads).toBe(0)
  expect(iterations).toBe(0)
  if (pinned.body.kind !== 'object') throw new Error('pinned')
  const pinnedName = pinned.body.entries[0]?.value
  if (pinnedName?.kind !== 'string') throw new Error('pinned name')
  expect(pinnedName.value).toBe('read_file')
})

it('rejects a pin whose body was not read', () => {
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  expect(() =>
    pinBody({ identity: id.id, version: 'v3', source: 'workspace-w', body: { name: 'read_file' } }),
  ).toThrow(/body was not read/)
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
  expect(registry.lookup('tool')?.judge(document('{"name":"review"}'))).toEqual({
    ok: false,
    rejected: 'name-mismatch',
  })
})

function contract(category: string): BodyContract {
  return {
    category,
    schema: { kind: 'null' },
    judge(body) {
      const record = body as JsonValue
      const name =
        record.kind === 'object'
          ? record.entries.find(entry => entry.key === 'name')?.value
          : undefined
      const text = name?.kind === 'string' ? name.value : undefined
      if (
        text === category ||
        (category === 'tool' && text === 'read_file') ||
        (category === 'skill' && text === 'review')
      ) {
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
