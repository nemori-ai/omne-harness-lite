import { expect, it } from 'vitest'
import { createCategoryRegistry } from '@omne-harness/assets'
import { toolBodyContract } from '@omne-harness/tool'

it('accepts read_file and records skill references without making them required', () => {
  const registry = createCategoryRegistry()
  const port = toolBodyContract()
  registry.register(port)
  const body = { name: 'read_file', composes: { skills: ['review'] } }
  expect(port.judge(body, { capabilityName: 'read_file' })).toEqual({ ok: true })
  expect(port.references(body)).toEqual([{ category: 'skill', name: 'review' }])
  expect(port.deriveDeclarations(body)).toEqual({ entries: [] })
  expect(registry.lookup('tool')).toBe(port)
})

it('rejects a tool body whose name is not the capability name', () => {
  const port = toolBodyContract()
  expect(port.judge({ name: 'write_file' }, { capabilityName: 'read_file' })).toEqual({
    rejected: 'name-mismatch',
  })
  expect(() => port.references({ name: '' })).toThrow(/failed judgment/)
  expect(() => port.deriveDeclarations({ name: '' })).toThrow(/failed judgment/)
})
