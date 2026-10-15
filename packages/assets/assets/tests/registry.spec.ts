import { expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryRegistry,
  pinBody,
  unknownCategory,
  type BodyContract,
} from '@omne-harness/assets'

it('rejects an identity that omits category or name', () => {
  expect(capabilityId('', 'read_file')).toEqual({ ok: false, rejected: 'incomplete-reference' })
  expect(capabilityId('tool', '')).toEqual({ ok: false, rejected: 'incomplete-reference' })
})

it('keeps a pinned version and source without replacing the body', () => {
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  const body = { name: 'read_file' }
  const pinned = pinBody({
    identity: id.id,
    version: 'v3',
    source: 'workspace-w',
    body,
  })
  expect(pinned).toEqual({
    identity: { category: 'tool', name: 'read_file' },
    version: 'v3',
    source: 'workspace-w',
    body,
  })
  expect(pinned.body).toBe(body)
})

it('rejects a second registration of the same category and reports an unknown category', () => {
  const registry = createCategoryRegistry()
  const tool = contract('tool')
  registry.register(tool)
  expect(() => registry.register(contract('tool'))).toThrow(/already registered/)
  expect(registry.lookup('tool')).toBe(tool)
  expect(unknownCategory(registry, 'mcp')).toEqual({ rejected: 'unknown-category' })
})

it('stores two category ports without reading their bodies', () => {
  const registry = createCategoryRegistry()
  const tool = contract('tool')
  const skill = contract('skill')
  registry.register(tool)
  registry.register(skill)
  expect(registry.lookup('tool')?.judge({ name: 'read_file' })).toEqual({ ok: true })
  expect(registry.lookup('skill')?.judge({ name: 'review' })).toEqual({ ok: true })
  expect(registry.lookup('tool')?.judge({ name: 'review' })).toEqual({ rejected: 'name-mismatch' })
})

function contract(category: string): BodyContract {
  return {
    category,
    schema: { kind: category },
    judge(body) {
      const record = body as { name?: string }
      if (record.name === category || (category === 'tool' && record.name === 'read_file') || (category === 'skill' && record.name === 'review')) {
        return { ok: true }
      }
      return { rejected: 'name-mismatch' }
    },
    deriveDeclarations() {
      return { entries: [] }
    },
    references() {
      return []
    },
  }
}
