import { expect, it } from 'vitest'
import { capabilityId, createCategoryRegistry, isReadBody, pinBody, readBodyText, type JsonLimits, type JsonValue } from '@omne-harness/assets'
import { toolBodyContract } from '@omne-harness/tool'

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

it('does not treat a registered schema literal as a read body', () => {
  const registry = createCategoryRegistry()
  const schema = {
    kind: 'object' as const,
    entries: [{ key: 'name', value: { kind: 'string' as const, value: 'read_file' } }],
  }
  registry.register({
    category: 'literal',
    schema,
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  })
  const stored = registry.lookup('literal')?.schema
  expect(isReadBody(stored)).toBe(false)
  expect(toolBodyContract().judge(stored, { capabilityName: 'read_file' })).toEqual({
    ok: false,
    rejected: 'incomplete-reference',
  })
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  expect(() => pinBody({ identity: id.id, version: 'v1', source: 's', body: stored })).toThrow(/body was not read/)
})

it('accepts read_file and records skill references without making them required', () => {
  const registry = createCategoryRegistry()
  const port = toolBodyContract()
  registry.register(port)
  const body = document('{"name":"read_file","composes":{"skills":["review"]}}')
  expect(port.judge(body, { capabilityName: 'read_file' })).toEqual({ ok: true })
  expect(port.references(body)).toEqual([{ category: 'skill', name: 'review' }])
  expect(port.deriveDeclarations(body)).toEqual({ entries: [] })
  expect(registry.lookup('tool')?.category).toBe('tool')
})

it('does not treat an object literal as a read document', () => {
  const port = toolBodyContract()
  let ran = false
  const body = {
    name: 'read_file',
    run() {
      ran = true
    },
  }
  expect(port.judge(body)).toEqual({ ok: false, rejected: 'incomplete-reference' })
  expect(ran).toBe(false)
})

it('does not call a getter installed on a read document', () => {
  const body = document('{"name":"read_file"}')
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
  const port = toolBodyContract()
  expect(port.judge(body, { capabilityName: 'read_file' })).toEqual({ ok: true })
  expect(reads).toBe(0)
  expect(name.value).toBe('read_file')
})

it('rejects a forged tool document without calling its functions', () => {
  const port = toolBodyContract()
  expect(port.judge({ kind: 'object', entries: [{ key: 'name', value: { kind: 'string', value: 7 } }] })).toEqual({
    ok: false,
    rejected: 'incomplete-reference',
  })
  expect(port.judge({ kind: 'object', entries: [null] })).toEqual({
    ok: false,
    rejected: 'incomplete-reference',
  })
  const entries = [{ key: 'name', value: { kind: 'string', value: 'read_file' } }]
  let calls = 0
  type Row = (typeof entries)[number]
  entries.find = function (predicate: (value: Row, index: number, list: Row[]) => boolean): Row | undefined {
    calls += 1
    return Array.prototype.find.call(this, predicate)
  }
  expect(port.judge({ kind: 'object', entries })).toEqual({ ok: false, rejected: 'incomplete-reference' })
  expect(calls).toBe(0)
})

it('keeps a pinned skill reference after the read document changes', () => {
  const original = document('{"name":"read_file","composes":{"skills":["review"]}}')
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  const pinned = pinBody({ identity: id.id, version: 'v3', source: 'workspace-w', body: original })
  const port = toolBodyContract()
  expect(port.references(pinned.body)).toEqual([{ category: 'skill', name: 'review' }])
  if (original.kind !== 'object') throw new Error('object')
  const composes = original.entries[1]?.value
  if (composes?.kind !== 'object') throw new Error('composes')
  const skills = composes.entries[0]?.value
  if (skills?.kind !== 'array' || skills.items[0]?.kind !== 'string') throw new Error('skills')
  expect(() => {
    ;(skills.items[0] as { value: string }).value = 'replacement'
  }).toThrow(TypeError)
  expect(pinned.body).not.toBe(original)
  expect(port.references(pinned.body)).toEqual([{ category: 'skill', name: 'review' }])
  expect(pinned.version).toBe('v3')
  expect(pinned.source).toBe('workspace-w')
})

it('rejects a tool body whose name is not the capability name', () => {
  const port = toolBodyContract()
  const body = document('{"name":"write_file","composes":{"skills":["review"]}}')
  const context = { capabilityName: 'read_file' }
  expect(port.judge(body, context)).toEqual({ ok: false, rejected: 'name-mismatch' })
  expect(() => port.deriveDeclarations(body, context)).toThrow(/failed judgment: name-mismatch/)
  expect(() => port.references(body, context)).toThrow(/failed judgment: name-mismatch/)
})
